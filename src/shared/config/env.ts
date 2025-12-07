// Unified config reader for both Node.js and Cloudflare Workers

export type UnifiedConfig = {
  // Server
  HOST: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';

  // MCP
  MCP_TITLE: string;
  MCP_VERSION: string;

  // Internal API key to access this MCP server
  API_KEY?: string;

  // Replicate API Token (stored server-side)
  REPLICATE_API_TOKEN?: string;

  // Logging
  LOG_LEVEL: 'debug' | 'info' | 'warning' | 'error';
};

function parseNumber(value: unknown, defaultValue: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * Parse environment variables into a unified config object
 */
export function parseConfig(env: Record<string, unknown>): UnifiedConfig {
  return {
    HOST: String(env.HOST || '127.0.0.1'),
    PORT: parseNumber(env.PORT, 3000),
    NODE_ENV: (env.NODE_ENV as UnifiedConfig['NODE_ENV']) || 'development',

    MCP_TITLE: String(env.MCP_TITLE || 'Replicate MCP Server'),
    MCP_VERSION: String(env.MCP_VERSION || '1.0.0'),

    API_KEY: env.API_KEY as string | undefined,
    REPLICATE_API_TOKEN: env.REPLICATE_API_TOKEN as string | undefined,

    LOG_LEVEL: (env.LOG_LEVEL as UnifiedConfig['LOG_LEVEL']) || 'info',
  };
}

export function resolveConfig(): UnifiedConfig {
  return parseConfig(process.env as Record<string, unknown>);
}
