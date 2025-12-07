# Replicate MCP Server

Lightweight MCP server for AI image generation and editing using Replicate's official models.

Author: [overment](https://x.com/_overment)

## Overview

This is a focused, minimal MCP server designed specifically for image generation workflows. Unlike full-featured Replicate clients, this server exposes only what's needed for image generation and editing with official models like Flux, SDXL, and Seedream.

**Recommended usage**: Tell your assistant upfront which model you prefer and any specific settings (quality, aspect ratio, style). This reduces tool calls and gets better results faster.

Example system prompt addition:
```
For image generation, use black-forest-labs/flux-schnell with 16:9 aspect ratio unless I specify otherwise.
```

## Notice

This repo works in two ways:
- As a **Node/Hono server** for local workflows
- As a **Cloudflare Worker** for remote interactions

## Features

- **Search Models** — Find image generation models with full input schemas
- **Generate Images** — Run predictions and get results with expiring URLs
- **Lightweight** — Only 2 tools, no OAuth complexity
- **API Key Auth** — Simple Bearer token or X-Api-Key header authentication
- **Dual Runtime** — Node.js/Bun or Cloudflare Workers

### Design Principles

- **LLM-friendly**: Two focused tools, not 1:1 API mirrors
- **Schema-aware**: Search returns input schemas so agent knows exact parameters
- **Secure**: Replicate API key stored as secret, clients use separate bearer token
- **Clear feedback**: Model parameters, generation time, markdown-ready output

---

## Installation

Prerequisites: [Bun](https://bun.sh/), [Replicate Account](https://replicate.com/account/api-tokens).

### Ways to Run (Pick One)

1. **Local Development** — Standard setup with bearer token auth
2. **Cloudflare Worker (wrangler dev)** — Local Worker testing
3. **Cloudflare Worker (deploy)** — Remote production

---

### 1. Local Development — Quick Start

1. Get Replicate API token:
   - Visit [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)
   - Create a new API token
   - Copy the token (starts with `r8_`)

2. Configure environment:

```bash
cd replicate-mcp
bun install
cp env.example .env
```

Edit `.env`:

```env
PORT=3000

# Generate with: openssl rand -hex 32
API_KEY=your-random-auth-token

# Replicate API Token (from replicate.com)
REPLICATE_API_TOKEN=r8_your_token_here
```

3. Run:

```bash
bun dev
# MCP: http://127.0.0.1:3000/mcp
```

**Claude Desktop / Cursor:**

```json
{
  "mcpServers": {
    "replicate": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp", "--transport", "http-only"],
      "env": { "NO_PROXY": "127.0.0.1,localhost" }
    }
  }
}
```

---

### 2. Cloudflare Worker (Local Dev)

```bash
bun x wrangler dev --local | cat
```

Create `.dev.vars` for local secrets:

```env
API_KEY=your_random_auth_token
REPLICATE_API_TOKEN=r8_your_replicate_token
```

Endpoint: `http://127.0.0.1:8787/mcp`

---

### 3. Cloudflare Worker (Deploy)

1. Create KV namespace for session storage:

```bash
bun x wrangler kv:namespace create TOKENS
```

Output will show:
```
Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "TOKENS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

2. Update `wrangler.toml` with your KV namespace ID:

```toml
[[kv_namespaces]]
binding = "TOKENS"
id = "your-kv-namespace-id-from-step-1"
```

3. Set secrets:

```bash
# Generate a random token for client authentication
openssl rand -hex 32
bun x wrangler secret put API_KEY
# Paste the generated token when prompted

# Replicate API token
bun x wrangler secret put REPLICATE_API_TOKEN
# Paste your Replicate token when prompted
```

4. Deploy:

```bash
bun x wrangler deploy
```

Endpoint: `https://<worker-name>.<account>.workers.dev/mcp`

---

## Client Configuration

### Alice App

Add as MCP server with:
- URL: `https://your-worker.workers.dev/mcp`
- Type: `streamable-http`
- Header: `Authorization: Bearer <your-API_KEY>`

### Claude Desktop / Cursor (Local Server)

```json
{
  "mcpServers": {
    "replicate": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp", "--transport", "http-only"],
      "env": { "NO_PROXY": "127.0.0.1,localhost" }
    }
  }
}
```

### Claude Desktop / Cursor (Cloudflare Worker)

```json
{
  "mcpServers": {
    "replicate": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-worker.workers.dev/mcp", "--transport", "http-only"]
    }
  }
}
```

### MCP Inspector (Quick Test)

```bash
bunx @modelcontextprotocol/inspector
# Connect to: http://localhost:3000/mcp (local) or https://your-worker.workers.dev/mcp (remote)
```

---

## Tools

### `search_models`

Search for models and get their input schemas. Returns up to 5 models with full parameter details.

```ts
// Input
{
  query: string;  // Model name, task, or keywords
}

// Output
### owner/name
Description of the model
Runs: 1,234,567

Input parameters:
  - prompt [REQUIRED]: string
  - aspect_ratio: enum: ["1:1", "16:9", "9:16"] = "1:1"
  - num_outputs: integer = 1
  ...
```

**Example:**
```json
{ "query": "flux" }
```

### `generate_image`

Run an image generation model and wait for the result.

```ts
// Input
{
  model: string;                    // "owner/name" format
  input: Record<string, unknown>;   // Model-specific parameters
}

// Output
## Image Generated in 2.3s

Model: black-forest-labs/flux-schnell

Display the image to the user using markdown syntax:

![Generated image](https://replicate.delivery/...)

Note: URLs expire in 1 hour.
```

**Common input patterns:**

```json
// Text-to-image
{
  "model": "black-forest-labs/flux-schnell",
  "input": {
    "prompt": "a cat on the moon",
    "aspect_ratio": "16:9"
  }
}

// Image editing
{
  "model": "black-forest-labs/flux-kontext-pro",
  "input": {
    "prompt": "change the sky to sunset",
    "image": "https://example.com/source.jpg"
  }
}
```

---

## Popular Models

| Model | Speed | Best For |
|-------|-------|----------|
| `black-forest-labs/flux-schnell` | ~2s | Quick generations, drafts |
| `black-forest-labs/flux-dev` | ~10s | Higher quality, detailed |
| `bytedance/seedream-4` | ~5s | Versatile, multi-reference |
| `black-forest-labs/flux-kontext-pro` | ~8s | Image editing with text |

## Aspect Ratio Guide

| Ratio | Use Case |
|-------|----------|
| `1:1` | Portraits, icons, profile pictures |
| `16:9` | Landscapes, cinematic, desktop wallpapers |
| `9:16` | Mobile wallpapers, stories, vertical content |
| `4:3` | Classic photo format |
| `21:9` | Ultra-wide cinematic |

---

## HTTP Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp` | POST | MCP JSON-RPC 2.0 |
| `/health` | GET | Health check |

---

## Environment Variables

### Node.js (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `REPLICATE_API_TOKEN` | ✓ | Replicate API token (r8_...) |
| `API_KEY` | ✓ | Auth token for MCP clients |
| `PORT` | | Server port (default: 3000) |
| `HOST` | | Server host (default: 127.0.0.1) |

### Cloudflare Workers (wrangler.toml + secrets)

**wrangler.toml vars:**
```toml
[vars]
MCP_TITLE = "Replicate MCP Server"
MCP_VERSION = "1.0.0"
```

**Secrets (set via `wrangler secret put`):**
- `API_KEY` — Random auth token for clients
- `REPLICATE_API_TOKEN` — Replicate API token

**KV Namespace:**
```toml
[[kv_namespaces]]
binding = "TOKENS"
id = "your-kv-namespace-id"
```

---

## Development

```bash
bun dev           # Start with hot reload
bun run typecheck # TypeScript check
bun run lint      # Lint code
bun run build     # Production build
bun start         # Run production
```

---

## Architecture

```
src/
├── config/
│   └── metadata.ts              # Tool descriptions
├── tools/
│   ├── search-models.tool.ts    # Search with schema enrichment
│   └── generate-image.tool.ts   # Run predictions
├── services/
│   └── api/
│       └── replicate.service.ts # Replicate API client
├── http/
│   ├── app.ts                   # Hono server
│   └── middlewares/
│       └── auth.ts              # API key validation
├── index.ts                     # Node.js entry
└── worker.ts                    # Workers entry
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check `API_KEY` is set and client sends `Authorization: Bearer <token>` |
| "REPLICATE_API_TOKEN not configured" | Set secret: `wrangler secret put REPLICATE_API_TOKEN` |
| "Invalid model format" | Use `owner/name` format (e.g., `black-forest-labs/flux-schnell`) |
| "Missing required parameters" | Call `search_models` to see exact input schema |
| "Rate limit exceeded" | Wait a moment and retry |
| "Image URL expired" | URLs expire after 1 hour — generate again |
| KV namespace error | Run `wrangler kv:namespace create TOKENS` and update wrangler.toml |

### Debugging

Test with MCP Inspector:

```bash
bunx @modelcontextprotocol/inspector
# Connect to your endpoint and test tools
```

Check Worker logs:

```bash
wrangler tail
```

---

## License

MIT
