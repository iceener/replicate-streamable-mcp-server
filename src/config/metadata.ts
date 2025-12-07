/**
 * Centralized tool metadata for the Replicate MCP server.
 *
 * Rich, LLM-friendly descriptions optimized for agent understanding.
 */

export interface ToolMetadata {
  name: string;
  title: string;
  description: string;
}

export const toolsMetadata = {
  search_models: {
    name: 'search_models',
    title: 'Search Models',
    description: `Search for ML models on Replicate and get their input schemas.

Returns up to 5 models with full input parameters, so you can immediately use generate_image.

WHEN TO USE:
- User mentions a model name but you need the exact "{owner}/{name}" identifier and its parameters
- User describes a task and you need to find suitable models
- User asks "what models can do X?"

SEARCH TIPS:
- Search by model name: "flux", "sdxl", "seedream"
- Search by task: "image generation", "upscale", "remove background"
- Search by style: "anime", "realistic", "artistic"

RESULTS INCLUDE FOR EACH MODEL:
- owner/name: Full model identifier for use with generate_image
- description: What the model does
- run_count: Popularity indicator (higher = more tested/reliable)
- input_schema: Required and optional parameters with types, defaults, and valid values

POPULAR IMAGE MODELS:
- "flux" -> black-forest-labs/flux-schnell, flux-dev, flux-kontext-pro
- "sdxl" -> stability-ai/sdxl
- "seedream" -> bytedance/seedream-4

After search, you have all the information needed to call generate_image.`,
  },

  generate_image: {
    name: 'generate_image',
    title: 'Generate Image',
    description: `Run an image generation model on Replicate and wait for the result.

BEFORE CALLING - CHECK THESE:
1. Model specified? If user didn't specify a model, ASK which they prefer:
   - flux-schnell (fast ~2s), flux-dev (quality ~10s), seedream-4 (versatile)
2. Parameters known? If unsure, call search_models first to get input schema

WHEN TO USE:
- User wants to generate an image from text
- User wants to edit/transform an existing image
- You know the model name and its required parameters

PROMPT HANDLING:
- Use the user's prompt EXACTLY as provided - do not rewrite or "improve" it
- If user says "a cat on the moon", use "a cat on the moon" not an enhanced version
- Only add detail if user explicitly asks you to write/craft/improve the prompt
- Some models have "enhance_prompt" option - prefer setting that to true instead of rewriting

RESOLUTION AND ASPECT RATIO SELECTION:
Choose aspect_ratio based on the scene content being generated:
- "1:1" (square): Portraits, icons, profile pictures, centered subjects
- "16:9" (landscape): Wide scenes, landscapes, panoramas, desktop wallpapers, cinematic shots
- "9:16" (portrait/vertical): Mobile wallpapers, tall subjects, full-body portraits, stories format
- "4:3": Classic photo format, general purpose
- "3:2": Standard photography, good for most scenes
- "21:9": Ultra-wide cinematic, epic landscapes

If model supports custom dimensions (width/height instead of aspect_ratio):
- Standard: 1024x1024
- Landscape: 1280x720, 1920x1080
- Portrait: 720x1280, 1080x1920
- High detail: Use larger dimensions when available

IMAGE INPUTS (for img2img / editing):
- Images must be provided as publicly accessible HTTPS URLs
- The user may paste a URL directly, or you may have a URL from a previous generation
- For models that accept multiple images (e.g., seedream-4 "image_input"):
  - Pass as array: ["https://url1.jpg", "https://url2.jpg"]
  - Order matters: first image is primary reference, subsequent are additional context
- For single-image models (e.g., flux-kontext "image"):
  - Pass as string: "https://url.jpg"

COMMON MODELS (use search_models if you need exact parameters):

Text-to-Image:
- black-forest-labs/flux-schnell: Fast (~2s). Input: prompt, aspect_ratio
- black-forest-labs/flux-dev: Higher quality (~10s). Input: prompt, aspect_ratio, guidance_scale
- bytedance/seedream-4: Versatile. Input: prompt, size, aspect_ratio, enhance_prompt

Image Editing:
- black-forest-labs/flux-kontext-pro: Edit with text instructions
  Input: prompt (edit instruction), image (source URL)

OUTPUT HANDLING:
- Returns image URLs that expire in 1 hour
- IMMEDIATELY display images to user using markdown: ![description](url)
- For multiple images, display each one
- Most models return 1 image, some return multiple`,
  },
} as const satisfies Record<string, ToolMetadata>;

/**
 * Type-safe helper to get metadata for a tool.
 */
export function getToolMetadata(toolName: keyof typeof toolsMetadata): ToolMetadata {
  return toolsMetadata[toolName];
}

/**
 * Get all registered tool names.
 */
export function getToolNames(): string[] {
  return Object.keys(toolsMetadata);
}

/**
 * Server-level metadata
 */
export const serverMetadata = {
  title: 'Replicate MCP Server',
  instructions: `Lightweight Replicate MCP for AI image generation and editing using official models.

WHEN USER ASKS TO GENERATE AN IMAGE:
If no model is specified, ASK the user which model they prefer before proceeding.
Suggest options like:
- flux-schnell (fast, ~2s)
- flux-dev (higher quality, ~10s)
- seedream-4 (versatile)

Also ask about preferences: quality vs speed, aspect ratio, any style preferences.

WORKFLOW:
1. If model not specified -> ask user for model preference
2. If model parameters unknown -> call search_models to get input schema
3. Call generate_image with correct parameters

RULES:
- Use the user's prompt exactly as provided - do not rewrite prompts
- Choose aspect_ratio based on scene content (landscape for wide scenes, portrait for tall subjects)
- Image URLs expire after 1 hour - display them immediately using markdown: ![description](url)`,
} as const;
