import type { RequestContext } from '../types/context.js';
import type { CancellationToken } from '../utils/cancellation.js';
import { createCancellationToken } from '../utils/cancellation.js';

/**
 * Global registry for request contexts.
 * Maps request IDs to their contexts (including cancellation tokens and replicate token).
 */
class ContextRegistry {
  private contexts = new Map<string | number, RequestContext>();

  /**
   * Create and register a new request context.
   */
  create(
    requestId: string | number,
    sessionId?: string,
    data?: {
      replicateToken?: string;
    },
  ): RequestContext {
    const context: RequestContext = {
      sessionId,
      cancellationToken: createCancellationToken(),
      requestId,
      timestamp: Date.now(),
      replicateToken: data?.replicateToken,
    };

    this.contexts.set(requestId, context);
    return context;
  }

  /**
   * Get the context for a request ID.
   */
  get(requestId: string | number): RequestContext | undefined {
    return this.contexts.get(requestId);
  }

  /**
   * Get the cancellation token for a request ID.
   */
  getCancellationToken(requestId: string | number): CancellationToken | undefined {
    return this.contexts.get(requestId)?.cancellationToken;
  }

  /**
   * Cancel a request by its ID.
   */
  cancel(requestId: string | number): boolean {
    const context = this.contexts.get(requestId);
    if (!context) return false;

    context.cancellationToken.cancel();
    return true;
  }

  /**
   * Delete a request context (cleanup after request completes).
   */
  delete(requestId: string | number): void {
    this.contexts.delete(requestId);
  }

  /**
   * Clean up expired contexts (older than 10 minutes).
   */
  cleanupExpired(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000;

    for (const [requestId, context] of this.contexts.entries()) {
      if (now - context.timestamp > maxAge) {
        this.contexts.delete(requestId);
      }
    }
  }
}

export const contextRegistry = new ContextRegistry();

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

export function startContextCleanup(): void {
  if (cleanupIntervalId) return;
  cleanupIntervalId = setInterval(() => {
    contextRegistry.cleanupExpired();
  }, 60_000);
}

export function stopContextCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

startContextCleanup();
