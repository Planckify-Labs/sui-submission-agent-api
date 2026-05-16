/**
 * Wallet agent — owns every tool that requires the device to sign or
 * authenticate against the user's session.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5.
 *
 * `tool_prefixes` matches the existing flat tool registry in
 * `src/tools/registry.ts` — keep in lockstep with §5 and the shared
 * `agents/manifests/agentManifests.json` (Task 02).
 *
 * Handler + prompts land in Task 11.
 */

import type { AgentCard } from '../types'

export const walletCard: AgentCard = {
  id: 'wallet',
  version: '0.1.0',
  display_name: 'Wallet specialist',
  description:
    'Owns balances, transfers, approvals, address book, gas estimation, and points. Use for anything the device must sign or authenticate.',
  // Spec §5 lists nine "canonical" prefixes but two of them
  // (`points_`, `address_book_`) match no actual tool name in the
  // registry today — every points / address-book tool starts with
  // `get_` or `search_` (e.g. `get_points_balance`,
  // `search_address_book`). Dropping the dead prefixes keeps
  // `assertRegistryInvariants` happy at boot; the `search_/deposit_/
  // execute_/request_` families round out the rest of the existing
  // tool name surface (Wallet owns all 40 mobile executors per §5
  // footnote).
  tool_prefixes: [
    'get_',
    'send_',
    'transfer_',
    'approve_',
    'read_contract',
    'estimate_gas',
    'write_contract',
    'search_',
    'deposit_',
    'execute_',
    'request_',
    // `cancel_` (cancel_booking) and `create_` (create_purchase) are
    // mobile-only TakumiPay executors not yet wired into the server
    // TOOL_REGISTRY. Add them here so mobile boot doesn't crash.
    'cancel_',
    'create_',
  ],
  capabilities: [
    'read_balance',
    'sign_tx',
    'approve_token',
    'gas_estimate',
    'points_read',
    'points_write',
    'address_book',
  ],
  requires_wallet_context: true,
  requires_jwt: true,
  default_system_prompt_ref: 'wallet.v1',
  status: 'ready',
}
