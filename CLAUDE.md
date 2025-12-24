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

Takumi Agent API is a NestJS server that integrates Claude AI with blockchain operations and TakumiPay payment system through the Model Context Protocol (MCP).

### Core Components

```
src/
├── main.ts                    # Fastify bootstrap
├── chat.controller.ts         # POST /chat endpoint
├── chat.service.ts            # AI streaming with Claude Haiku
├── mcp-client.service.ts      # MCP client lifecycle (spawns stdio server)
├── mcp/
│   ├── server.ts              # Standalone MCP server (stdio transport)
│   └── tools/                 # Tool definitions and handlers
├── blockchain/
│   ├── services/              # BlockchainService, WalletService
│   ├── clients/               # Viem client factory (cached per chainId)
│   ├── chains/                # ChainRegistry (auto-loads 150+ chains from Viem)
│   └── errors/                # Error normalization
├── takumipay/                 # TakumiPay API client (Ky-based)
├── guards/                    # API key validation guard
└── constants/                 # ERC20 ABI and other constants
```

### Request Flow

1. `POST /chat` → ApiKeyGuard validates auth
2. ChatService fetches tools from MCPClientService
3. `streamText()` with Claude Haiku processes messages
4. Claude may call MCP tools → routed to mcp/server.ts handlers
5. Streamed response returned to client

### MCP Tool Categories

- **Blockchain Read-Only**: get_balance, read_contract, get_transaction, get_supported_chains
- **Wallet Tools** (requires AGENT_WALLET_PRIVATE_KEY): send_native_token, write_contract, get_wallet_address, estimate_gas
- **TakumiPay Tools** (requires TAKUMIPAY_API_KEY): product search, variants, pricing, exchange rates
- **Token Contract Tools**: ERC20 token operations

### Adding New MCP Tools

1. Create tool file in `src/mcp/tools/` with:
   - Tool definition (Zod schema + inputSchema)
   - Handler function receiving `(args, services)`
2. Register in `src/mcp/tools/index.ts` → `createToolHandlers()` factory
3. Configure response filtering in `response-transformer.ts` if needed

### Key Patterns

- **Service Injection to Tools**: All handlers receive `{ blockchainService, walletService, chainRegistry, takumiPayService }`
- **Lazy Initialization**: Wallet/TakumiPay services silently disabled if credentials missing
- **Client Caching**: Viem PublicClient and WalletClient cached per chainId
- **Response Transformation**: Configurable field filtering to reduce token usage
- **Zod Validation**: All MCP tool inputs validated with schemas

## Environment Variables

```
ANTHROPIC_API_KEY           # Required - Claude API key
CHAT_API_KEY                # Required - API key for /chat endpoint
AGENT_WALLET_PRIVATE_KEY    # Optional - Enables wallet write operations
TAKUMIPAY_API_KEY           # Optional - Enables TakumiPay tools
TAKUMIPAY_BASE_URL          # Optional - TakumiPay base URL
```

## API Authentication

Include API key via:
- `x-api-key` header
- `Authorization: Bearer <key>` header
- `secrectApiKey` query/body parameter
