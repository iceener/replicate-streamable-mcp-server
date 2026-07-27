import type { AppConfig } from '../config/env.js';

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}
async function secretsEqual(presented: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(presented), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
function bearerToken(request: Request): string | undefined {
  return request.headers.get('Authorization')?.match(/^\s*Bearer\s+(.+)$/i)?.[1];
}
function rejection(status: 401 | 503, message: string): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message },
      id: null,
    },
    {
      status,
      headers: status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined,
    },
  );
}

/** Authenticate MCP callers without exposing or reusing the Replicate credential. */
export async function mcpAuthResponse(
  request: Request,
  config: AppConfig,
): Promise<Response | undefined> {
  if (!config.AUTH_ENABLED) return undefined;
  if (!config.API_KEY) return rejection(503, 'Server authentication is misconfigured');
  const presented =
    bearerToken(request) ?? request.headers.get('X-Api-Key') ?? undefined;
  if (!presented || !(await secretsEqual(presented, config.API_KEY))) {
    return rejection(401, 'Unauthorized: Invalid or missing API key');
  }
  return undefined;
}
