# Task 02 — `buildHumanSummary()` for simulate/write tools

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §11 "The `human_summary` Builder (Server-Side)"
**Depends on:** Task 01 (`TOOL_REGISTRY`)

## Why this matters

Mobile renders `meta.human_summary` directly in preview cards and approval
sheets. If mobile had to construct the string itself, every new tool would
require a coordinated mobile release. Building it server-side from
Zod-validated tool inputs means new tools ship with no mobile change.

Also: `human_summary` is **not** free-form LLM text. It is deterministic,
built from validated inputs. This is a security property — see §13.

## Scope

Create `src/tools/human-summary.ts`:

```ts
export function buildHumanSummary(
  name:  string,
  input: Record<string, unknown>,
): string
```

## Required cases

Every `capability: "simulate"` and `capability: "write"` tool in the registry
must have a case. Reads do not need summaries (silent execution).

Minimum set, copied from §11:

- `estimate_gas` — "Gas estimate: ~0.002 ETH ($3.20)"
- `send_native_token` — "Send 0.5 ETH to 0x123…ef on Polygon"
- `transfer_erc20` — "Send 3 USDT to 0x742d…ef on Polygon"
- `write_contract` — "Call `transfer()` on 0xAbCd…"
- `approve_erc20` — "Approve 0xDeFi…ef to spend up to 100 USDC"
- `create_booking` — "Preview: Telkomsel 50K — Rp 50.000 (not yet executed)"
- `execute_booking` — "Pay Rp 50.000 for Telkomsel 50K (booking #BK-4821)"
- `cancel_booking` — "Cancel booking #BK-4821 (Telkomsel 50K)"
- `create_purchase` — "Purchase Telkomsel 50K for Rp 50.000"

Default branch returns `Execute ${name}` so unknown simulate/write tools are
still renderable (mobile will fall back to a safe `confirm` anyway).

## Helpers expected

- `formatEther(bigint) → string` (use viem's `formatEther` or equivalent)
- `truncateAddress("0x742d35Cc...ef") → "0x742d…ef"`

## Acceptance

- [ ] All simulate/write tools covered with a case.
- [ ] Inputs typed as `Record<string, unknown>` and narrowed inside each case
      (do not trust LLM output — treat as opaque).
- [ ] No branch throws on missing optional fields — prefer `?? "?"` fallbacks
      so the approval sheet never crashes.
- [ ] Unit tests: one per case, asserting the exact output string for a
      canonical input.

## Security reminder

Tool inputs arrive from the LLM. They must be Zod-validated before reaching
this function. `buildHumanSummary` assumes its inputs are already validated.
Do not call it on raw LLM output.
