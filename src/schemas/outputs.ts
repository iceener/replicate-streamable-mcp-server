import { z } from 'zod';

// ============================================
// Replicate Tool Outputs
// ============================================

// search_models output
export const SearchModelsOutput = z.object({
  models: z.array(z.object({
    owner: z.string().describe('Model owner/organization'),
    name: z.string().describe('Model name'),
    description: z.string().nullable().describe('Model description'),
    run_count: z.number().describe('Number of times the model has been run'),
  })).describe('List of matching models, sorted by relevance'),
});
export type SearchModelsOutput = z.infer<typeof SearchModelsOutput>;

// generate_image output
export const GenerateImageOutput = z.object({
  id: z.string().describe('Prediction ID for reference'),
  status: z.enum(['succeeded', 'failed', 'canceled']).describe('Final prediction status'),
  output: z.array(z.string()).nullable().describe('Array of generated image URLs (expire in 1 hour)'),
  error: z.string().nullable().describe('Error message if status is failed'),
  metrics: z.object({
    predict_time: z.number().optional().describe('Generation time in seconds'),
  }).optional(),
});
export type GenerateImageOutput = z.infer<typeof GenerateImageOutput>;
