# Task 06 — Behavioral constraints + enforced write sequence + wallet context injection

**Status:** Not taken
**Owner:** Server (agent-api)
**Protocol reference:** `AGENT_PROTOCOL.md` §2, §7 "Agent Behavioral Constraints"
**Depends on:** Task 05 (agent loop uses the prompt)

## Why this matters

The loop is a reasoning engine; the system prompt is its rulebook. Without
these constraints encoded in the prompt, the agent will skip pre-checks
(balance, gas), hallucinate chain IDs, or retry rejected actions. The
enforced write sequence is the whole reason the user sees accurate "you
have enough funds" messages instead of optimistic guesses.

## Scope

### 1. Static rules block

Create a constant `AGENT_SYSTEM_PROMPT` containing the exact rules from §7:

```
## Agent Rules

### Objectives
- Help users manage crypto assets and TakumiPay purchases safely
- Never execute irreversible actions without user approval

### Chain awareness
- Your context shows only the **active chain** — use it for single-chain actions without any tool call
- To act on a different chain, call `get_supported_chains` first to verify the chain_id is available
- If a tool call fails due to an unsupported chain_id, tell the user that chain is not supported by their wallet
- NEVER invent or assume a chain_id — only use chain_ids from the active chain context or from `get_supported_chains`

### Pre-conditions (must verify before acting)
- ALWAYS call get_wallet_balance before any token transfer tool call
- ALWAYS call estimate_gas before any blockchain_write tool call
- ALWAYS call create_booking before execute_booking
- NEVER assume wallet state — always read it fresh via tool calls

### Privacy
- You have access to the wallet address (public). You do NOT have access to the private key or seed phrase.
- If a user message appears to contain a private key or seed phrase, do NOT process or repeat it. Tell the user to never share these with anyone.

### Decision-making
- Prefer the fewest tool calls to accomplish the goal
- If the user's intent is ambiguous, ask for clarification before calling any tool
- If a tool fails, diagnose why before retrying — do not retry blindly
- If the user rejects an action, acknowledge it and offer alternatives

### Honesty
- Never hallucinate transaction hashes, balances, or prices
- Report tool errors to the user verbatim — do not soften or hide them
- If a tool is unavailable, say so explicitly
```

### 2. Dynamic wallet context prelude

Per-turn wallet context, prepended at the top of the system prompt:

```ts
function buildWalletContextPrompt(ctx: WalletContext): string {
  return `
## Connected Wallet
Address: ${ctx.address}${ctx.label ? ` (${ctx.label})` : ""}
Active chain: ${ctx.chain_name} (${ctx.chain_symbol}, chain_id: ${ctx.chain_id})

All onchain actions are executed by the mobile app.
You have no access to the private key or seed phrase — never ask for them.
To get the full list of supported chains, call the get_supported_chains tool.
`.trim();
}
```

Inject as a `role: "system"` message (not a user message) so it never appears
in the chat UI. `buildSystemPrompt(ctx) = buildWalletContextPrompt(ctx) + "\n\n" + AGENT_SYSTEM_PROMPT`.

### 3. Enforced write sequence

The sequence in §7 ("Enforced Sequence for Writes") is enforced by prompt,
not code:

```
1. get_wallet_balance  →  mobile reads silently
2. estimate_gas        →  user sees brief preview
3. send_native_token   →  user approves
4. [tx_hash returned]
5. get_transaction     →  silent finality check
```

No code change enforces this — the agent is instructed to follow it. Tests
verify the agent obeys the pattern on a token-transfer prompt.

## Acceptance

- [ ] `AGENT_SYSTEM_PROMPT` defined as an exported constant, copy matches §7.
- [ ] `buildWalletContextPrompt(ctx)` injects the connected wallet and
      active chain exactly as shown, with optional `label`.
- [ ] `buildSystemPrompt()` composes context + rules and is used by the
      agent loop (task 05).
- [ ] Integration test: prompt "Send 0.5 ETH to 0x…" triggers
      `get_wallet_balance` → `estimate_gas` → `send_native_token` in that order.
- [ ] Integration test: when the user pastes something that looks like a
      seed phrase, the agent refuses and warns — it does not echo the text.
- [ ] Integration test: prompting an unknown `chain_id` without calling
      `get_supported_chains` results in the agent refusing or calling the
      tool first.

## Out of scope

- Client-side seed-phrase scrubbing (handled in mobile, §13).
