---
phase: 2
area: mobile
section: §4
title: Implement get_wallet_tokens executor on mobile
---

# 10 — Implement `get_wallet_tokens` executor (mobile)

## Context

`protocol_v1.1.md` §4 adds `get_wallet_tokens` — a mobile-executed read tool
that resolves token symbols to contract addresses. The server registration is
in task 09. This task implements the actual executor logic on the mobile.

All data sources already exist on the mobile:
- `TBlockchain.tokens[]` from `useBlockchainsWithStorage` (via
  `ExecutorContext.blockchains`) for the token list + stablecoin flags.
- Per-chain viem public clients (same as existing `get_balance` executor) for
  live balance reads when `include_balance: true`.

## What to do

In `mobile-app/services/agent-executors/reads.ts`, add:

```typescript
get_wallet_tokens: async (input, context) => {
  const chainId = resolveChainId(input, context);
  const blockchain = context.blockchains[chainId];
  if (!blockchain) {
    return { status: "failed", error: `Chain ${chainId} not found in registry` };
  }

  const includeNative = input.is_native_currency !== false; // default true
  let tokens = blockchain.tokens ?? [];

  // Include native currency as a pseudo-token if requested
  if (includeNative) {
    tokens = [
      {
        symbol:         blockchain.nativeSymbol,
        name:           blockchain.nativeName ?? blockchain.nativeSymbol,
        address:        "0x0000000000000000000000000000000000000000" as `0x${string}`,
        decimals:       blockchain.nativeDecimals ?? 18,
        is_native:      true,
        isStableCoin:   false,
      },
      ...tokens,
    ];
  }

  // Apply filters
  if (input.symbol) {
    const sym = input.symbol.toLowerCase();
    tokens = tokens.filter(t =>
      t.symbol.toLowerCase().startsWith(sym) ||
      t.symbol.toLowerCase() === sym
    );
  }
  if (input.is_stable_coin !== undefined) {
    tokens = tokens.filter(t => t.isStableCoin === input.is_stable_coin);
  }

  // Resolve balances if requested
  const client = input.include_balance
    ? resolveChainClients(chainId, context)
    : null;

  const result = await Promise.all(tokens.map(async (token) => {
    let balance_wei: string | undefined;
    let balance_display: string | undefined;

    if (client) {
      if (token.is_native) {
        const raw = await client.getBalance({ address: context.walletAddress });
        balance_wei     = raw.toString(10);
        balance_display = formatUnits(raw, token.decimals ?? 18);
      } else if (token.address) {
        const raw = await client.readContract({
          address:      token.address,
          abi:          erc20Abi,
          functionName: "balanceOf",
          args:         [context.walletAddress],
        });
        balance_wei     = (raw as bigint).toString(10);
        balance_display = formatUnits(raw as bigint, token.decimals ?? 18);
      }
    }

    return {
      symbol:         token.symbol,
      name:           token.name,
      address:        token.address ?? "0x0000000000000000000000000000000000000000",
      decimals:       token.decimals ?? 18,
      is_native:      token.is_native ?? false,
      is_stable_coin: token.isStableCoin ?? false,
      logo_url:       token.logoUrl ?? undefined,
      ...(balance_wei     !== undefined ? { balance_wei }     : {}),
      ...(balance_display !== undefined ? { balance_display } : {}),
    };
  }));

  return {
    status: "success",
    data:   { chain_id: chainId, tokens: result },
  };
},
```

### Register in executor registry

In `mobile-app/services/agent-executors/index.ts` (or wherever executors are
registered), add `get_wallet_tokens` to the executor map and to
`EXPECTED_MOBILE_TOOLS`.

## Output shape (per spec)

```typescript
{
  chain_id: number;
  tokens: Array<{
    symbol:           string;
    name:             string;
    address:          `0x${string}`;
    decimals:         number;
    is_native:        boolean;
    is_stable_coin:   boolean;
    logo_url?:        string;
    balance_wei?:     string;    // base-10; present iff include_balance was true
    balance_display?: string;    // formatted; present iff balance_wei present
  }>;
}
```

## Acceptance criteria

- [ ] `get_wallet_tokens` executor exists in `reads.ts`.
- [ ] `symbol`, `is_stable_coin`, `is_native_currency` filters work correctly.
- [ ] `include_balance: true` fetches live balances for native + ERC20 tokens.
- [ ] `is_native_currency: false` excludes the native token from results.
- [ ] All bigint balance values are serialized as base-10 strings.
- [ ] `get_wallet_tokens` added to `EXPECTED_MOBILE_TOOLS`.
- [ ] `assertRegistryParity()` passes.

## References

- `protocol_v1.1.md` §4 "New tool: get_wallet_tokens"
- `mobile-app/services/agent-executors/reads.ts`
- `mobile-app/services/agent-executors/types.ts` (`resolveChainId`, `resolveChainClients`)
