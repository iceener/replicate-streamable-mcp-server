import { afterEach, describe, expect, test } from 'bun:test';
import {
  Client,
  type FetchLike,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { type AppConfig, parseConfig } from '../src/config/env.js';
import { buildHttpApp, type HttpRuntime } from '../src/http/app.js';
import type { ReplicateToolServices } from '../src/types/context.js';

const runtimes = new Set<HttpRuntime>();
const clients = new Set<Client>();
afterEach(async () => {
  await Promise.all([...clients].map((client) => client.close()));
  await Promise.all([...runtimes].map((runtime) => runtime.close()));
  clients.clear();
  runtimes.clear();
});

function testConfig(overrides: Record<string, unknown> = {}): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    MCP_PUBLIC_URL: 'http://localhost:3000/mcp',
    MCP_ALLOWED_HOSTS: 'localhost',
    MCP_ALLOWED_ORIGIN_HOSTNAMES: 'localhost',
    REPLICATE_API_TOKEN: 'provider-secret',
    ...overrides,
  });
}
function mockServices(assertToken = true): ReplicateToolServices {
  return {
    async searchModels(query, token) {
      if (assertToken) expect(token).toBe('provider-secret');
      return [
        {
          owner: 'black-forest-labs',
          name: 'flux-schnell',
          description: `Result for ${query}`,
          run_count: 123,
          input_schema: {
            required: ['prompt'],
            properties: { prompt: { type: 'string' } },
          },
        },
      ];
    },
    async runPrediction(model, _input, token) {
      if (assertToken) expect(token).toBe('provider-secret');
      return {
        id: 'prediction-1',
        status: 'succeeded',
        output: ['https://example.test/image.png'],
        error: null,
        metrics: { predict_time: model.length / 10 },
      };
    },
  };
}
function createRuntime(config = testConfig(), services = mockServices()): HttpRuntime {
  const runtime = buildHttpApp(config, { runtimeName: 'test', services });
  runtimes.add(runtime);
  return runtime;
}
function runtimeFetch(runtime: HttpRuntime, token?: string): FetchLike {
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Host', 'localhost:3000');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return runtime.fetch(new Request(url, { ...init, headers }));
  };
}
async function connect(
  runtime: HttpRuntime,
  mode: 'modern' | 'legacy',
  token?: string,
): Promise<Client> {
  const client = new Client(
    { name: `replicate-${mode}-test`, version: '1.0.0' },
    mode === 'modern'
      ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      : undefined,
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
      fetch: runtimeFetch(runtime, token),
      ...(token ? { authProvider: { token: async () => token } } : {}),
    }),
  );
  clients.add(client);
  return client;
}
function firstText(result: { content?: unknown[] }): string {
  const content = result.content?.[0];
  return content && typeof content === 'object' && 'text' in content
    ? String(content.text)
    : '';
}

describe('Replicate MCP v2 protocol', () => {
  test('negotiates modern 2026-07-28 and preserves the tool contract', async () => {
    const client = await connect(createRuntime(), 'modern');
    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: true } });

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      'search_models',
      'generate_image',
    ]);
    expect(listed.tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      required: ['query'],
      additionalProperties: false,
    });
    expect(listed.tools[1]?.inputSchema).toMatchObject({
      type: 'object',
      required: ['model', 'input'],
      additionalProperties: false,
    });
    expect(listed.tools.every((tool) => tool.outputSchema === undefined)).toBe(true);

    const result = await client.callTool({
      name: 'search_models',
      arguments: { query: 'flux' },
    });
    expect(result.isError).not.toBe(true);
    expect(firstText(result)).toContain('black-forest-labs/flux-schnell');
  });

  test('serves SDK-owned stateless legacy initialize/list/call behavior', async () => {
    const client = await connect(createRuntime(), 'legacy');
    expect(client.getProtocolEra()).toBe('legacy');
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      'search_models',
      'generate_image',
    ]);
    const result = await client.callTool({
      name: 'generate_image',
      arguments: {
        model: 'black-forest-labs/flux-schnell',
        input: { prompt: 'a cat on the moon' },
      },
    });
    expect(firstText(result)).toContain('https://example.test/image.png');
  });

  test('preserves provider failure mapping as a tool error', async () => {
    const services = mockServices(false);
    services.searchModels = async () => {
      throw new Error('mock Replicate failure');
    };
    const client = await connect(createRuntime(testConfig(), services), 'modern');
    const result = await client.callTool({
      name: 'search_models',
      arguments: { query: 'failure' },
    });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('mock Replicate failure');
  });

  test('propagates client cancellation through the v2 request signal', async () => {
    const services = mockServices(false);
    services.searchModels = async (_query, _token, signal) =>
      new Promise((_, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    const client = await connect(createRuntime(testConfig(), services), 'modern');
    const controller = new AbortController();
    const pending = client.callTool(
      { name: 'search_models', arguments: { query: 'cancel' } },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow();
  });

  test('keeps MCP access auth separate from the provider credential', async () => {
    let providerToken = '';
    const services = mockServices(false);
    services.runPrediction = async (_model, _input, token) => {
      providerToken = token;
      return {
        id: 'prediction-2',
        status: 'succeeded',
        output: ['https://example.test/separated.png'],
        error: null,
      };
    };
    const runtime = createRuntime(
      testConfig({ API_KEY: 'mcp-access-secret' }),
      services,
    );
    const client = await connect(runtime, 'modern', 'mcp-access-secret');
    await client.callTool({
      name: 'generate_image',
      arguments: {
        model: 'owner/model',
        input: { prompt: 'unchanged prompt' },
      },
    });
    expect(providerToken).toBe('provider-secret');
    expect(providerToken).not.toBe('mcp-access-secret');
  });

  test('enforces transport errors and HTTP security boundaries', async () => {
    const runtime = createRuntime(testConfig({ MCP_MAX_REQUEST_BYTES: '1024' }));
    const [getResponse, deleteResponse] = await Promise.all([
      runtime.fetch(
        new Request('http://localhost:3000/mcp', {
          method: 'GET',
          headers: { Host: 'localhost:3000' },
        }),
      ),
      runtime.fetch(
        new Request('http://localhost:3000/mcp', {
          method: 'DELETE',
          headers: { Host: 'localhost:3000' },
        }),
      ),
    ]);
    expect(getResponse.status).toBe(405);
    expect(deleteResponse.status).toBe(405);
    expect(getResponse.headers.has('Mcp-Session-Id')).toBe(false);

    const unsupportedBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2099-01-01',
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'raw-test', version: '1.0.0' },
        },
      },
    });
    const unsupported = await runtime.fetch(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2099-01-01',
          'Mcp-Method': 'server/discover',
        },
        body: unsupportedBody,
      }),
    );
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: { code: -32022 } });

    const badHost = await runtime.fetch(
      new Request('http://localhost:3000/health', {
        headers: { Host: 'evil.example' },
      }),
    );
    expect(badHost.status).toBe(403);
    const badOrigin = await runtime.fetch(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { Host: 'localhost:3000', Origin: 'https://evil.example' },
        body: '{}',
      }),
    );
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const preflight = await runtime.fetch(
      new Request('http://localhost:3000/mcp', {
        method: 'OPTIONS',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:8080',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, x-api-key, mcp-method',
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:8080',
    );
    const oversized = await runtime.fetch(
      new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: { Host: 'localhost:3000', 'Content-Type': 'application/json' },
        body: 'x'.repeat(1_025),
      }),
    );
    expect(oversized.status).toBe(413);
  });
});
