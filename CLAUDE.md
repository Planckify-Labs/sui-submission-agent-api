# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Compile TypeScript to dist/
pnpm run start:dev    # Development with watch mode
pnpm run start:prod   # Production mode (node dist/main)
pnpm run lint         # ESLint with auto-fix
pnpm run format       # Prettier formatting
pnpm run test         # Run unit tests
pnpm run test:watch   # Tests in watch mode
pnpm run test:e2e     # End-to-end tests
pnpm run test:mcp     # MCP-specific tests (bash test-mcp.sh)
```

## Architecture Overview

Takumi Agent API is a NestJS server that runs an AI agent (Kimi K2) and orchestrates a tool-call loop. The server has no blockchain infrastructure — no RPC clients, no viem client for onchain calls, no chain registry, no private keys — and (post protocol v1.1 §11) no off-chain product/credential integrations either. Every tool call (blockchain or points/redemption) executes on the mobile client via the mobile-executor protocol; the server only orchestrates the reasoning loop.

### Core Components

```
src/
├── main.ts                    # Fastify bootstrap
├── chat.controller.ts         # POST /chat endpoint
├── chat.service.ts            # AI streaming + agent loop
├── mcp-client.service.ts      # MCP client lifecycle (spawns stdio server)
├── mcp/
│   ├── server.ts              # Bare MCP stdio template (owner + calculator only)
│   └── tools/                 # Empty handler-factory extension point
├── tools/                     # Central tool registry + human-summary builder
├── agent/                     # System prompt + agent-loop helpers
├── session/                   # Chat session service
├── guards/                    # API key validation guard
└── constants/                 # ERC20 ABI (legacy, unused after v1.1 §11)
```

### Request Flow

1. `POST /chat` → ApiKeyGuard validates auth
2. ChatService fetches any server-side tools from MCPClientService (empty in v1.1) and merges them with mobile-executor tool descriptors from the central registry
3. The agent streams via Kimi K2; the registry has no `executor: "server"` entries today, so every tool call pauses the loop and emits a `tool_pending` SSE event
4. Mobile executes the call and posts the result to `/chat/:sessionId/respond`; the loop resumes
5. Final response streamed back to client

### Tool Categories (all `executor: "mobile"` after protocol v1.1 §11 + §12)

- **Blockchain reads**: `get_balance`, `get_wallet_balance`, `read_contract`, `get_transaction`, `get_wallet_address`, `get_supported_chains`, `get_wallet_tokens`, `estimate_gas`.
- **Blockchain writes**: `send_native_token`, `transfer_erc20`, `write_contract`, `approve_erc20`.
- **Points & redemption** (`category: "points"`): `get_redemption_categories`, `get_redemption_catalog`, `search_redemption_catalog`, `get_product_details`, `get_product_input_fields`, `get_points_price`, `get_points_balance`, `get_points_history`, `deposit_points`, `execute_redemption`, `get_redemption_status`, `get_redemption_history`, `request_authentication`.

All categories run on the mobile client. The server holds no per-user credential — JWTs and refresh tokens live in mobile secure storage, and the agent reads only `wallet_context.points_authenticated` to decide whether to call `request_authentication` first.

### MCP subprocess (`src/mcp/`)

The MCP stdio subprocess is retained as a bare diagnostic template per protocol v1.1 §11. It exposes only `owner` and `calculator` — neither is registered in `TOOL_REGISTRY`, so the LLM cannot call them. They exist so future server-local (non-credentialed, non-blockchain) integrations have a working scaffold to copy. `createToolHandlers()` in `src/mcp/tools/index.ts` is an empty handler map kept as an extension point.

### Adding new agent tools

- **Mobile-executed tool** (the default): add an entry to `TOOL_REGISTRY` in `src/tools/registry.ts` with `executor: "mobile"`, the right `category` and `capability`, and a concrete `inputSchema`. Add a `buildHumanSummary()` case in `src/tools/human-summary.ts` (a stub label is fine for `read` tools; `write` and `simulate` need a meaningful sentence). Update `registry.spec.ts` and `human-summary.spec.ts` so the parity tests cover it. The mobile must implement the matching executor and add the tool name to `EXPECTED_MOBILE_TOOLS`.
- **Server-executed diagnostic tool**: register it inline in `src/mcp/server.ts` (mirroring `owner` / `calculator`). Do NOT add it to `TOOL_REGISTRY` unless the LLM should be able to call it; if you do, set `executor: "server"` and wire a handler in `createToolHandlers()`.

### Key patterns

- **Zero credentials on the server.** The agent server never holds RPC URLs, private keys, JWTs, refresh tokens, or third-party API keys. The only secret it knows is `KIMI_K2_API_KEY` for the model and `CHAT_API_KEY` for the inbound `/chat` route.
- **Central registry is normative.** `TOOL_REGISTRY` is the single source of truth for tool name, executor, capability, category, and input schema. Mobile parity is enforced by `EXPECTED_MOBILE_TOOLS` + `assertRegistryParity()` on the mobile side.
- **Human summaries are deterministic and server-built.** The mobile renders `meta.human_summary` verbatim — never let the LLM author the approval-sheet text.
- **Zod validation** at the MCP boundary (still applied to `owner` / `calculator` even though they are diagnostic).

## Environment Variables

```
KIMI_K2_API_KEY             # Required - Kimi K2 API key (agent model)
CHAT_API_KEY                # Required - API key for /chat endpoint
MCP_COMMAND                 # Optional - Override MCP subprocess command (default: node)
MCP_ARGS                    # Optional - Override MCP subprocess args (default: dist/mcp/server.js)
```

Note: the server has no blockchain infrastructure and no off-chain product integration. All onchain operations and all points/redemption API calls execute on the mobile client via the mobile-executor protocol, so no RPC URL, chain id, wallet private key, or third-party API key env vars are accepted.

## API Authentication

Include API key via:
- `x-api-key` header
- `Authorization: Bearer <key>` header
- `secrectApiKey` query/body parameter
