import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { contextRegistry } from '../core/context.js';
import type { RequestContext } from '../types/context.js';
import { createCancellationToken } from '../utils/cancellation.js';
import { logger } from '../utils/logger.js';

// Replicate tools
import { searchModelsTool } from './search-models.tool.js';
import { generateImageTool } from './generate-image.tool.js';

/**
 * Register all tools with the MCP server.
 */
export function registerTools(server: McpServer): void {
  const registeredNames: string[] = [];

  // Register Replicate tools (without output schemas to avoid serialization issues)
  const replicateTools = [
    searchModelsTool,
    generateImageTool,
  ];

  for (const definition of replicateTools) {
    try {
      const wrappedHandler = createWrappedHandler(server, definition.handler);

      server.registerTool(
        definition.name,
        {
          description: definition.description,
          // Use .shape for SDK registration (SDK expects the raw shape, not full ZodObject)
          inputSchema: definition.inputSchema.shape as unknown as Parameters<typeof server.registerTool>[1]['inputSchema'],
        },
        wrappedHandler as Parameters<typeof server.registerTool>[2],
      );

      registeredNames.push(definition.name);
      logger.debug('tools', { message: 'Registered tool', toolName: definition.name });
    } catch (error) {
      logger.error('tools', {
        message: 'Failed to register tool',
        toolName: definition.name,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  logger.info('tools', {
    message: `Registered ${registeredNames.length} tools`,
    toolNames: registeredNames,
  });
}

/**
 * Create a wrapped handler that injects request context with replicate token.
 */
function createWrappedHandler(
  _server: McpServer,
  handler: (args: unknown, context?: RequestContext) => Promise<unknown>,
) {
  return async (args: unknown, extra?: { requestId?: string | number; signal?: AbortSignal }) => {
    const requestId = extra?.requestId;

    let context: RequestContext;
    if (requestId) {
      const existingContext = contextRegistry.get(requestId);
      if (existingContext) {
        context = existingContext;
      } else {
        context = contextRegistry.create(requestId);
      }
    } else {
      context = {
        cancellationToken: createCancellationToken(),
        timestamp: Date.now(),
      };
    }

    try {
      const result = await handler(args, context);
      return result;
    } finally {
      if (requestId) {
        contextRegistry.delete(requestId);
      }
    }
  };
}
