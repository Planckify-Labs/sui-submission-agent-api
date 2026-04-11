# Task 07 — Remove `src/blockchain/` (server has no blockchain infrastructure)

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §3 "Why All Onchain on Mobile", §14 item 7
**Depends on:** Tasks 01, 05, 08 — everything that used to call into `blockchain/` must already route through mobile.

## Why this matters

The protocol's core architectural decision: **"The server has zero
blockchain infrastructure — no RPC connections, no viem client, no chain
registry."** Leaving `src/blockchain/` in place after the mobile-executor
refactor is dead code at best and a source of dangerous divergence at
worst (server reads a different block than the mobile just acted on,
nonce conflicts, etc.).

## Scope

Delete the entire `src/blockchain/` directory, including:

- `src/blockchain/services/` (BlockchainService, WalletService)
- `src/blockchain/clients/` (Viem client factory)
- `src/blockchain/chains/` (ChainRegistry — 150+ chains auto-loaded from Viem)
- `src/blockchain/errors/` (error normalization)
- `src/constants/` entries only used by the blockchain module
  (keep `ERC20_ABI` if the server-side MCP still needs it for tool
  descriptions; remove if unused)

Also:

- Remove all imports of `src/blockchain/*` from the rest of the codebase.
- Remove blockchain-related environment variables from:
  - `src/main.ts` / config module
  - `.env.example`
  - `Dockerfile` if it exposes them
  - `README.md`
  - `CLAUDE.md` environment variables section
- Specifically, `AGENT_WALLET_PRIVATE_KEY` must be deleted. The server must
  not accept it even as a no-op. Private keys never touch the server (§13).
- Uninstall `viem` from `package.json` if no remaining file imports it.
  (Double-check `src/mcp/` tool files — see task 08.)

## Verification checklist

Run these to prove nothing depends on the module anymore:

```bash
rg "from.*blockchain/" src/           # expect: nothing
rg "AGENT_WALLET_PRIVATE_KEY" .        # expect: nothing
rg "from ['\"]viem['\"]" src/          # expect: nothing (unless task 08 keeps it for ABI types only)
pnpm run build                         # expect: clean compile
pnpm run test                          # expect: green
```

## Order of operations

This task MUST come AFTER:
- Task 05 (agent loop no longer calls BlockchainService/WalletService directly).
- Task 08 (internal blockchain MCP tools removed — they were the main
  blockchain consumers).

If either of those is still using `src/blockchain/`, stop and finish them
first. Do not delete the module while something imports it.

## Acceptance

- [ ] `src/blockchain/` directory no longer exists.
- [ ] `pnpm run build` is clean.
- [ ] `pnpm run test` is green.
- [ ] `.env.example` has no blockchain/private-key env vars.
- [ ] `CLAUDE.md` environment-variables section updated.
- [ ] `viem` removed from dependencies if no other file uses it.
- [ ] Git diff confirms no caller is broken.

## Out of scope

- Mobile-side viem integration (that's the point — it lives on mobile now).
