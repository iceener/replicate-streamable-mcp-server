import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { toolsMetadata } from '../config/metadata.js';
import { strictSchema } from '../schemas/common.js';
import { runPrediction } from '../services/api/replicate.service.js';
import type { RequestContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

const GenerateImageInputSchema = strictSchema({
  model: z
    .string()
    .min(1, 'Model cannot be empty')
    .regex(/^[^/]+\/[^/]+$/, 'Model must be in format "owner/name" (e.g., "black-forest-labs/flux-schnell")')
    .describe('Full model identifier in format "owner/name" (e.g., "black-forest-labs/flux-schnell"). Use search_models if unsure.'),
  input: z
    .record(z.any())
    .describe(`Model input as JSON object. Key fields by task:

TEXT-TO-IMAGE:
  { "prompt": "user's exact prompt text", "aspect_ratio": "16:9" }

IMAGE EDITING:
  { "prompt": "edit instruction", "image": "https://source-image-url" }

MULTI-REFERENCE:
  { "prompt": "description", "image_input": ["https://url1", "https://url2"] }

Use search_models to find exact schema if unsure - parameters vary by model.`),
});

export const generateImageTool = {
  name: toolsMetadata.generate_image.name,
  title: toolsMetadata.generate_image.title,
  description: toolsMetadata.generate_image.description,
  inputSchema: GenerateImageInputSchema,

  handler: async (args: unknown, context?: RequestContext): Promise<CallToolResult> => {
    const parsed = GenerateImageInputSchema.safeParse(args);

    if (!parsed.success) {
      const errorDetails = parsed.error.errors
        .map((err) => `- ${err.path.join('.')}: ${err.message}`)
        .join('\n');

      return {
        isError: true,
        content: [{
          type: 'text',
          text: `## Invalid Input\n\n${errorDetails}\n\nTip: Use search_models to see the correct input schema for your model.`,
        }],
      };
    }

    // Check for Replicate token (server-side config)
    if (!context?.replicateToken) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `## Server Configuration Error\n\nREPLICATE_API_TOKEN is not configured on the server.\n\nContact the server administrator.`,
        }],
      };
    }

    const { model, input } = parsed.data;

    // Validate that input has at least a prompt for most models
    if (!input.prompt && !input.image) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `## Missing Required Input

Most image models require at least a prompt or image in the input.

Example:
{
  "model": "${model}",
  "input": {
    "prompt": "a beautiful sunset over mountains"
  }
}

Use search_models to see the exact requirements for "${model}".`,
        }],
      };
    }

    try {
      logger.info('generate_image', { 
        message: 'Starting generation', 
        model, 
        hasPrompt: !!input.prompt,
        hasImage: !!input.image || !!input.image_input,
      });

      const prediction = await runPrediction(model, input, context.replicateToken);

      if (prediction.status === 'failed') {
        const errorMsg = prediction.error || 'Unknown error';
        const isRateLimit = errorMsg.toLowerCase().includes('rate limit') || 
                           errorMsg.toLowerCase().includes('too many requests') ||
                           errorMsg.includes('429');
        
        return {
          isError: true,
          content: [{
            type: 'text',
            text: isRateLimit 
              ? `## Rate Limit Exceeded

Model: ${model}

The Replicate API rate limit has been reached. Please wait a moment before trying again.`
              : `## Generation Failed

Model: ${model}
Error: ${errorMsg}

Suggestions:
- Check that all required parameters are provided
- Verify image URLs are publicly accessible
- Try a simpler prompt
- Use search_models to verify input schema`,
          }],
        };
      }

      if (prediction.status === 'canceled') {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `## Generation Cancelled

The prediction was cancelled before completion.`,
          }],
        };
      }

      // Success
      const outputUrls = prediction.output || [];
      const timeInfo = prediction.metrics?.predict_time 
        ? ` in ${prediction.metrics.predict_time.toFixed(1)}s`
        : '';

      const markdownImages = outputUrls
        .map((url, i) => outputUrls.length > 1 
          ? `Image ${i + 1}: ![Generated image ${i + 1}](${url})` 
          : `![Generated image](${url})`)
        .join('\n\n');

      logger.info('generate_image', { 
        message: 'Generation complete', 
        model, 
        outputCount: outputUrls.length,
        predictTime: prediction.metrics?.predict_time,
      });

      return {
        content: [{
          type: 'text',
          text: `## Image Generated${timeInfo}

Model: ${model}

Display the image to the user using markdown syntax:

${markdownImages}

Note: URLs expire in 1 hour.`,
        }],
      };
    } catch (error) {
      logger.error('generate_image', { 
        message: 'Generation failed', 
        model, 
        error: (error as Error).message,
      });

      const errorMsg = (error as Error).message;
      const isRateLimit = errorMsg.toLowerCase().includes('rate limit') || 
                         errorMsg.toLowerCase().includes('too many requests') ||
                         errorMsg.includes('429');

      return {
        isError: true,
        content: [{
          type: 'text',
          text: isRateLimit 
            ? `## Rate Limit Exceeded

Model: ${model}

The Replicate API rate limit has been reached. Please wait a moment before trying again.`
            : `## Generation Failed

Model: ${model}
Error: ${errorMsg}

Common issues:
- Model name is incorrect (use search_models to find it)
- Missing required parameters (use search_models to check schema)
- Image URLs not publicly accessible
- Rate limit exceeded`,
        }],
      };
    }
  },
};
