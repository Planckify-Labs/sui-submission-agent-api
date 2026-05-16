/**
 * DeFi agent — STUB v1.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5, §12, §14.2.
 *
 * `status: "stub"` is load-bearing — Core narrates "DeFi Strategies
 * are coming soon" when a stubbed tool result reaches it. Do not flip
 * to `"ready"` until the real DeFi backend (per
 * `docs/defi-strategies-spec.md`) lands. At that point: change `status`
 * here, replace the stub mobile executors in
 * `services/agent-executors/defi/stub.ts`, register the real
 * server-side tool implementations. NOTHING ELSE IN THE TOPOLOGY
 * CHANGES (§14.2).
 *
 * Handler + prompts land in Task 12.
 */

import type { AgentCard } from '../types'

export const defiCard: AgentCard = {
  id: 'defi',
  version: '0.1.0',
  display_name: 'DeFi specialist',
  description:
    'Owns yield strategies, opportunity discovery, rebalances, and position reads. Currently stubbed — every action returns a "coming soon" sentinel that Core paraphrases for the user.',
  tool_prefixes: ['defi_'],
  capabilities: ['yield_discovery', 'position_read', 'deposit', 'withdraw', 'rebalance'],
  requires_wallet_context: true,
  requires_jwt: true,
  default_system_prompt_ref: 'defi.v1',
  status: 'stub',
}
