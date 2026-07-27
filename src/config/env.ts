export type RuntimeEnvironment = 'development' | 'production' | 'test';
export type LegacyMode = 'stateless' | 'reject';
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export interface AppConfig {
  HOST: string;
  PORT: number;
  NODE_ENV: RuntimeEnvironment;
  LOG_LEVEL: LogLevel;
  MCP_NAME: string;
  MCP_TITLE: string;
  MCP_VERSION: string;
  MCP_INSTRUCTIONS: string;
  MCP_PUBLIC_URL: URL;
  MCP_ALLOWED_HOSTS: string[];
  MCP_ALLOWED_ORIGIN_HOSTNAMES: string[];
  MCP_LEGACY_MODE: LegacyMode;
  MCP_MAX_REQUEST_BYTES: number;
  API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
  AUTH_ENABLED: boolean;
  MCP_AUTH_HEADER: 'bearer-or-x-api-key';
}

function stringValue(env: Record<string, unknown>, key: string, fallback = ''): string {
  const value = env[key];
  return value === undefined || value === null || value === ''
    ? fallback
    : String(value).trim();
}

function numberValue(
  env: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(stringValue(env, key, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${key} must be an integer between 1 and 65535`);
  }
  return value;
}

function requestSizeValue(env: Record<string, unknown>): number {
  const value = Number(stringValue(env, 'MCP_MAX_REQUEST_BYTES', '1048576'));
  if (!Number.isInteger(value) || value < 1_024 || value > 10_485_760) {
    throw new Error(
      'MCP_MAX_REQUEST_BYTES must be an integer between 1024 and 10485760',
    );
  }
  return value;
}

function listValue(
  env: Record<string, unknown>,
  key: string,
  fallback: string[],
): string[] {
  const value = stringValue(env, key);
  if (!value) return [...fallback];
  return [
    ...new Set(
      value
        .split(/[ ,]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function enumValue<T extends string>(
  env: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = stringValue(env, key, fallback) as T;
  if (!values.includes(value))
    throw new Error(`${key} must be one of: ${values.join(', ')}`);
  return value;
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function publicUrlValue(
  env: Record<string, unknown>,
  port: number,
  environment: RuntimeEnvironment,
): URL {
  const configured = stringValue(env, 'MCP_PUBLIC_URL');
  if (environment === 'production' && !configured) {
    throw new Error('MCP_PUBLIC_URL is required in production');
  }
  let url: URL;
  try {
    url = new URL(configured || `http://localhost:${port}/mcp`);
  } catch {
    throw new Error('MCP_PUBLIC_URL must be an absolute URL');
  }
  if (url.search || url.hash) {
    throw new Error('MCP_PUBLIC_URL must not include a query string or fragment');
  }
  if (
    environment === 'production' &&
    url.protocol !== 'https:' &&
    !isLoopback(url.hostname)
  ) {
    throw new Error('MCP_PUBLIC_URL must use HTTPS in production');
  }
  return url;
}

export function parseConfig(env: Record<string, unknown>): AppConfig {
  const port = numberValue(env, 'PORT', 3000);
  const environment = enumValue(
    env,
    'NODE_ENV',
    ['development', 'production', 'test'] as const,
    'development',
  );
  const publicUrl = publicUrlValue(env, port, environment);
  const defaultHosts = [publicUrl.hostname];
  if (environment !== 'production')
    defaultHosts.push('localhost', '127.0.0.1', '[::1]');
  const title = stringValue(env, 'MCP_TITLE', 'Replicate MCP Server');
  const apiKey = stringValue(env, 'API_KEY') || undefined;

  return {
    HOST: stringValue(env, 'HOST', '127.0.0.1'),
    PORT: port,
    NODE_ENV: environment,
    LOG_LEVEL: enumValue(
      env,
      'LOG_LEVEL',
      ['debug', 'info', 'warning', 'error'] as const,
      'info',
    ),
    MCP_NAME: stringValue(env, 'MCP_NAME', title),
    MCP_TITLE: title,
    MCP_VERSION: stringValue(env, 'MCP_VERSION', '1.0.0'),
    MCP_INSTRUCTIONS: stringValue(
      env,
      'MCP_INSTRUCTIONS',
      'Search Replicate models before generating when model parameters are unknown.',
    ),
    MCP_PUBLIC_URL: publicUrl,
    MCP_ALLOWED_HOSTS: listValue(env, 'MCP_ALLOWED_HOSTS', defaultHosts),
    MCP_ALLOWED_ORIGIN_HOSTNAMES: listValue(
      env,
      'MCP_ALLOWED_ORIGIN_HOSTNAMES',
      defaultHosts,
    ),
    MCP_LEGACY_MODE: enumValue(
      env,
      'MCP_LEGACY_MODE',
      ['stateless', 'reject'] as const,
      'stateless',
    ),
    MCP_MAX_REQUEST_BYTES: requestSizeValue(env),
    API_KEY: apiKey,
    REPLICATE_API_TOKEN: stringValue(env, 'REPLICATE_API_TOKEN') || undefined,
    AUTH_ENABLED: Boolean(apiKey),
    MCP_AUTH_HEADER: 'bearer-or-x-api-key',
  };
}
