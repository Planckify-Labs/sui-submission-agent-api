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

Takumi Agent API is a NestJS server that runs an AI agent (Kimi K2) and routes tool calls through the Model Context Protocol (MCP) to off-chain APIs like TakumiPay. The server has no blockchain infrastructure — no RPC clients, no viem client for onchain calls, no chain registry, no private keys. Every onchain operation (read or write) executes on the mobile client via the mobile-executor protocol; the server only orchestrates the reasoning loop.

### Core Components

```
src/
├── main.ts                    # Fastify bootstrap
├── chat.controller.ts         # POST /chat endpoint
├── chat.service.ts            # AI streaming + agent loop
├── mcp-client.service.ts      # MCP client lifecycle (spawns stdio server)
├── mcp/
│   ├── server.ts              # Standalone MCP server (stdio transport)
│   └── tools/                 # Off-chain TakumiPay tool handlers
├── tools/                     # Central tool registry + human-summary builder
├── agent/                     # System prompt + agent-loop helpers
├── session/                   # Chat session service
├── takumipay/                 # TakumiPay API client (Ky-based)
├── guards/                    # API key validation guard
└── constants/                 # ERC20 ABI (used by token-contract MCP tool)
```

### Request Flow

1. `POST /chat` → ApiKeyGuard validates auth
2. ChatService fetches server-side tools from MCPClientService and merges with mobile-executor tool descriptors
3. The agent streams via Kimi K2; server-side (TakumiPay) tool calls run inline, mobile tool calls pause the loop and emit an SSE event
4. Mobile executes the call and posts the result to `/chat/:sessionId/respond`; the loop resumes
5. Final response streamed back to client

### Tool Categories

- **Mobile-executed (blockchain)**: get_balance, read_contract, get_transaction, get_supported_chains, estimate_gas, send_native_token, transfer_erc20, approve_erc20, write_contract, get_wallet_address. Declared in the central registry (`src/tools/registry.ts`); the server never executes these — they are serialized to the mobile client via SSE.
- **Server-executed (TakumiPay)** (requires TAKUMIPAY_API_KEY): product search, variants, pricing, exchange rates, token contract metadata. Implemented as MCP handlers in `src/mcp/tools/`.

### Adding New MCP Tools

1. Create tool file in `src/mcp/tools/` with:
   - Tool definition (Zod schema + inputSchema)
   - Handler function receiving `(args, services)`
2. Register in `src/mcp/tools/index.ts` → `createToolHandlers()` factory
3. Configure response filtering in `response-transformer.ts` if needed

### Key Patterns

- **Server has zero blockchain infrastructure**: no RPC clients, no viem chain registry, no private keys. All on-chain reads and writes execute on the mobile client (see `AGENT_PROTOCOL.md` §3, §13).
- **Service Injection to Tools**: MCP handlers receive `{ takumiPayService }` (the only injectable left).
- **Lazy Initialization**: TakumiPay service silently disabled if credentials missing.
- **Response Transformation**: Configurable field filtering to reduce token usage.
- **Zod Validation**: All MCP tool inputs validated with schemas.

## Environment Variables

```
KIMI_K2_API_KEY             # Required - Kimi K2 API key (agent model)
CHAT_API_KEY                # Required - API key for /chat endpoint
TAKUMIPAY_API_KEY           # Optional - Enables TakumiPay tools
TAKUMIPAY_BASE_URL          # Optional - TakumiPay base URL
```

Note: the server has no blockchain infrastructure. All onchain operations (reads, signs, writes) execute on the mobile client via the mobile-executor protocol, so no RPC URL, chain ID, or wallet private key env vars are accepted.

## API Authentication

Include API key via:
- `x-api-key` header
- `Authorization: Bearer <key>` header
- `secrectApiKey` query/body parameter
