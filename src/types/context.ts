import type {
  ModelSearchResult,
  PredictionResult,
} from '../services/api/replicate.service.js';

export interface ReplicateToolServices {
  searchModels(
    query: string,
    apiToken: string,
    signal?: AbortSignal,
  ): Promise<ModelSearchResult[]>;
  runPrediction(
    modelId: string,
    input: Record<string, unknown>,
    apiToken: string,
    signal?: AbortSignal,
  ): Promise<PredictionResult>;
}

/** Request-local values provided to Replicate tool handlers. */
export interface RequestContext {
  replicateToken?: string;
  signal: AbortSignal;
  services?: ReplicateToolServices;
}
