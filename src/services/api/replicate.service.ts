/**
 * Replicate API service
 * 
 * Provides a typed interface to Replicate's API for:
 * - Searching models
 * - Getting model details and schemas
 * - Running predictions (image generation)
 * 
 * Token is passed per-request (from headers or env fallback).
 */

import Replicate from 'replicate';
import { logger } from '../../utils/logger.js';

export interface ReplicateModel {
  owner: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  run_count: number;
  url: string;
  latest_version?: {
    id: string;
    openapi_schema?: {
      components?: {
        schemas?: {
          Input?: {
            type: string;
            required?: string[];
            properties?: Record<string, unknown>;
          };
          Output?: unknown;
        };
      };
    };
  };
}

export interface ModelSearchResult {
  owner: string;
  name: string;
  description: string | null;
  run_count: number;
  input_schema?: ModelInputSchema;
}

export interface ModelInputSchema {
  required: string[];
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    format?: string;
  }>;
}

export interface PredictionResult {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: string[] | null;
  error: string | null;
  metrics?: {
    predict_time?: number;
  };
}

/**
 * Create a Replicate client with the given token.
 * Token is required - throws if missing.
 */
export function createReplicateClient(apiToken: string): Replicate {
  if (!apiToken) {
    throw new Error('Replicate API token is required. Pass via X-Replicate-Token header or set REPLICATE_API_TOKEN env.');
  }
  
  return new Replicate({ auth: apiToken });
}

/**
 * Search for models on Replicate and enrich top results with input schemas.
 * Returns up to 5 models with full input schemas for immediate use.
 */
export async function searchModels(query: string, apiToken: string): Promise<ModelSearchResult[]> {
  const client = createReplicateClient(apiToken);
  
  logger.debug('replicate', { message: 'Searching models', query });
  
  const response = await client.models.search(query);
  
  // Take top 5 results only
  const topModels = response.results.slice(0, 5);
  
  // Enrich each result with input schema
  const enrichedResults: ModelSearchResult[] = await Promise.all(
    topModels.map(async (model) => {
      try {
        const fullModel = await client.models.get(model.owner, model.name);
        const modelData = fullModel as unknown as ReplicateModel;
        const inputSchema = modelData.latest_version?.openapi_schema?.components?.schemas?.Input;
        
        return {
          owner: model.owner,
          name: model.name,
          description: model.description ?? null,
          run_count: model.run_count ?? 0,
          input_schema: inputSchema ? {
            required: inputSchema.required ?? [],
            properties: (inputSchema.properties ?? {}) as ModelInputSchema['properties'],
          } : undefined,
        };
      } catch (error) {
        // If we can't get schema, return basic info
        logger.debug('replicate', { 
          message: 'Failed to get schema for model', 
          model: `${model.owner}/${model.name}`,
          error: (error as Error).message,
        });
        return {
          owner: model.owner,
          name: model.name,
          description: model.description ?? null,
          run_count: model.run_count ?? 0,
        };
      }
    })
  );
  
  logger.debug('replicate', { message: 'Search complete', count: enrichedResults.length });
  
  return enrichedResults;
}

/**
 * Get detailed model information including input schema
 */
export async function getModel(owner: string, name: string, apiToken: string): Promise<{
  owner: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  input_schema: ModelInputSchema;
}> {
  const client = createReplicateClient(apiToken);
  
  logger.debug('replicate', { message: 'Getting model', owner, name });
  
  const model = await client.models.get(owner, name);
  
  // Cast to access openapi_schema which may not be in the SDK types
  const modelData = model as unknown as ReplicateModel;
  const inputSchema = modelData.latest_version?.openapi_schema?.components?.schemas?.Input;
  
  return {
    owner: model.owner,
    name: model.name,
    description: model.description ?? null,
    visibility: model.visibility as 'public' | 'private',
    input_schema: {
      required: inputSchema?.required ?? [],
      properties: (inputSchema?.properties ?? {}) as ModelInputSchema['properties'],
    },
  };
}

/**
 * Run a prediction and wait for result
 */
export async function runPrediction(
  modelId: string,
  input: Record<string, unknown>,
  apiToken: string,
): Promise<PredictionResult> {
  const client = createReplicateClient(apiToken);
  
  logger.debug('replicate', { message: 'Running prediction', modelId, input });
  
  // Create prediction and wait for completion
  const prediction = await client.predictions.create({
    model: modelId,
    input,
  });
  
  // Wait for completion
  const result = await client.wait(prediction);
  
  logger.debug('replicate', { 
    message: 'Prediction complete', 
    id: result.id, 
    status: result.status,
  });
  
  // Normalize status - the SDK may return "aborted" which we map to "canceled"
  const normalizedStatus = result.status === 'canceled' || result.status === 'aborted' 
    ? 'canceled' as const
    : result.status as PredictionResult['status'];
  
  // Normalize error - could be string or object
  const errorMessage = result.error 
    ? (typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
    : null;
  
  return {
    id: result.id,
    status: normalizedStatus,
    output: Array.isArray(result.output) ? result.output : result.output ? [String(result.output)] : null,
    error: errorMessage,
    metrics: result.metrics as PredictionResult['metrics'],
  };
}
