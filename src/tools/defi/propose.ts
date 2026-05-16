/**
 * `defi_deposit` / `defi_withdraw` / `defi_rebalance` — DeFi writes.
 *
 * Spec: docs/multi-agent-architecture-spec.md §12,
 *       docs/defi-strategies-spec.md §11.
 *
 * v1: stubs. Each returns `{ status: "stubbed", message: "DeFi agent
 * is not yet wired up." }` from the mobile executor (Task 08). Core
 * paraphrases for the user — the sentinel never reaches UI verbatim
 * (CLAUDE.md user-facing-error rule).
 *
 * Names are FROZEN — they match `defi-strategies-spec.md` §11 byte for
 * byte so the stub → real flip is a no-op rename (§14.2). DO NOT
 * rename without first updating the DeFi spec.
 */

import { composeAgentTools } from '../internal/compose'
import { ADDRESS_PROP } from '../internal/schemas'
import type { ToolMeta } from '../internal/types'

const DEFI_DEPOSIT: ToolMeta = {
  name: 'defi_deposit',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Deposit into a single DeFi opportunity. v1: stubbed — returns { status: "stubbed", message: ... } that Core paraphrases as "DeFi Strategies are coming soon".',
  inputSchema: {
    type: 'object',
    properties: {
      protocol_slug: {
        type: 'string',
        description: 'Adapter selector, e.g. "aave-v3-base".',
      },
      chain_id: {
        type: 'integer',
        description: 'EVM chain id the deposit targets.',
        minimum: 1,
      },
      asset_symbol: {
        type: 'string',
        description: 'Asset symbol (e.g. "USDC").',
      },
      asset_contract: ADDRESS_PROP(
        'Optional ERC20 contract address (lowercased). When omitted the executor resolves it from the token registry.',
      ),
      amount_raw: {
        type: 'string',
        pattern: '^[0-9]+$',
        description:
          "Decimal-string amount in the token's smallest unit (bigint-safe).",
      },
      expected_apy: {
        type: 'number',
        description:
          'Optional APY hint from agent reasoning; the executor validates against the backend OpportunityCache (±5%) before signing.',
      },
      expected_tier: {
        type: 'string',
        enum: ['conservative', 'balanced', 'aggressive'],
        description: 'Optional risk-tier hint.',
      },
    },
    required: ['protocol_slug', 'chain_id', 'asset_symbol', 'amount_raw'],
    additionalProperties: false,
  },
}

const DEFI_WITHDRAW: ToolMeta = {
  name: 'defi_withdraw',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Withdraw partially or fully from a DeFi position. v1: stubbed.',
  inputSchema: {
    type: 'object',
    properties: {
      position_id: {
        type: 'string',
        description:
          'Position id from `defi_list_positions`. Required so the executor knows which adapter to call.',
      },
      amount_raw: {
        type: 'string',
        pattern: '^[0-9]+$',
        description:
          "Decimal-string amount in the position asset's smallest unit. Use the position's full balance for a full exit.",
      },
    },
    required: ['position_id', 'amount_raw'],
    additionalProperties: false,
  },
}

const DEFI_REBALANCE: ToolMeta = {
  name: 'defi_rebalance',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Move a position from one protocol to another (two-step: withdraw + deposit). v1: stubbed.',
  inputSchema: {
    type: 'object',
    properties: {
      position_id: {
        type: 'string',
        description: 'Position id to rebalance (from `defi_list_positions`).',
      },
      target_protocol_slug: {
        type: 'string',
        description:
          'Optional target protocol slug. When omitted the executor picks from the user\'s current tier-filtered opportunities.',
      },
    },
    required: ['position_id'],
    additionalProperties: false,
  },
}

export const DEFI_PROPOSE_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'defi',
  {
    defi_deposit: DEFI_DEPOSIT,
    defi_withdraw: DEFI_WITHDRAW,
    defi_rebalance: DEFI_REBALANCE,
  },
)
