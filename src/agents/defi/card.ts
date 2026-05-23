/**
 * DeFi agent — ready.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5, §12, §14.2;
 * docs/defi-strategies-spec.md §11.
 *
 * Reads (`defi_list_opportunities`, `defi_list_positions`) wire through
 * to the live `/strategies/*` backend in `api/src/strategies/`.
 * Writes (`defi_deposit` / `defi_withdraw` / `defi_rebalance` /
 * `defi_cross_chain_deposit`) currently surface a `not_implemented`
 * error until the on-chain adapter set in
 * `services/defi/adapters/*` is built out.
 */

import type { AgentCard } from '../types'

export const defiCard: AgentCard = {
  id: 'defi',
  version: '0.1.0',
  display_name: 'DeFi specialist',
  description:
    'Owns yield strategies, opportunity discovery, rebalances, and position reads.',
  tool_prefixes: ['defi_'],
  capabilities: ['yield_discovery', 'position_read', 'deposit', 'withdraw', 'rebalance'],
  requires_wallet_context: true,
  requires_jwt: true,
  default_system_prompt_ref: 'defi.v1',
  status: 'ready',
}
