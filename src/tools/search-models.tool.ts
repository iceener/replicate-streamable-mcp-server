import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { toolsMetadata } from '../config/metadata.js';
import { strictSchema } from '../schemas/common.js';
import { searchModels } from '../services/api/replicate.service.js';
import type { RequestContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

const SearchModelsInputSchema = strictSchema({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .describe('Search query - model name, task type, or keywords (e.g., "flux", "image generation", "upscale")'),
});

export const searchModelsTool = {
  name: toolsMetadata.search_models.name,
  title: toolsMetadata.search_models.title,
  description: toolsMetadata.search_models.description,
  inputSchema: SearchModelsInputSchema,

  handler: async (args: unknown, context?: RequestContext): Promise<CallToolResult> => {
    const parsed = SearchModelsInputSchema.safeParse(args);

    if (!parsed.success) {
      const errorDetails = parsed.error.errors
        .map((err) => `- ${err.path.join('.')}: ${err.message}`)
        .join('\n');

      return {
        isError: true,
        content: [{
          type: 'text',
          text: `## Invalid Input\n\n${errorDetails}`,
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

    const { query } = parsed.data;

    try {
      logger.info('search_models', { message: 'Searching models', query });

      const models = await searchModels(query, context.replicateToken);

      if (models.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `## No Models Found\n\nNo models matched the query "${query}".\n\nTry:\n- Using different keywords\n- Searching for model names like "flux", "sdxl", "stable-diffusion"`,
          }],
        };
      }

      // Format each model with its input schema
      const modelList = models
        .map((m) => {
          let output = `### ${m.owner}/${m.name}\n${m.description || 'No description'}\nRuns: ${m.run_count.toLocaleString()}`;
          
          if (m.input_schema) {
            const requiredParams = m.input_schema.required;
            const props = m.input_schema.properties;
            
            // Format key parameters (limit to most important ones)
            const paramEntries = Object.entries(props).slice(0, 10);
            if (paramEntries.length > 0) {
              const paramsList = paramEntries
                .map(([name, schema]) => {
                  const isRequired = requiredParams.includes(name);
                  const typeInfo = schema.enum 
                    ? `enum: [${schema.enum.slice(0, 5).map(v => `"${v}"`).join(', ')}${schema.enum.length > 5 ? '...' : ''}]`
                    : schema.type ?? 'any';
                  const defaultInfo = schema.default !== undefined 
                    ? ` = ${JSON.stringify(schema.default)}`
                    : '';
                  return `  - ${name}${isRequired ? ' [REQUIRED]' : ''}: ${typeInfo}${defaultInfo}`;
                })
                .join('\n');
              
              output += `\n\nInput parameters:\n${paramsList}`;
              if (Object.keys(props).length > 10) {
                output += `\n  ... and ${Object.keys(props).length - 10} more parameters`;
              }
            }
          }
          
          return output;
        })
        .join('\n\n---\n\n');

      return {
        content: [{
          type: 'text',
          text: `## Found ${models.length} Models for "${query}"\n\n${modelList}\n\n---\n\nYou can now call generate_image with any of these models using the parameters shown above.`,
        }],
      };
    } catch (error) {
      logger.error('search_models', { message: 'Search failed', error: (error as Error).message });

      const errorMsg = (error as Error).message;
      const isRateLimit = errorMsg.toLowerCase().includes('rate limit') || 
                         errorMsg.toLowerCase().includes('too many requests') ||
                         errorMsg.includes('429');

      return {
        isError: true,
        content: [{
          type: 'text',
          text: isRateLimit 
            ? `## Rate Limit Exceeded\n\nThe Replicate API rate limit has been reached. Please wait a moment before trying again.`
            : `## Search Failed\n\nError: ${errorMsg}\n\nPlease check the query and try again.`,
        }],
      };
    }
  },
};
