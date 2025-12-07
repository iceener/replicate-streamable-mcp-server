import type { CancellationToken } from '../utils/cancellation.js';

/**
 * Request context passed to tool handlers.
 */
export interface RequestContext {
  /**
   * Session ID from the MCP transport (if available).
   */
  sessionId?: string;

  /**
   * Cancellation token for the current request.
   */
  cancellationToken: CancellationToken;

  /**
   * Request ID from JSON-RPC message.
   */
  requestId?: string | number;

  /**
   * Timestamp when the request was received.
   */
  timestamp: number;

  /**
   * Replicate API token (from header or env).
   */
  replicateToken?: string;
}
