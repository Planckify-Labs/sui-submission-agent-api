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

import { composeAgentTools } from '../../../tools/internal/compose'
import { ADDRESS_PROP } from '../../../tools/internal/schemas'
import type { ToolMeta } from '../../../tools/internal/types'

const DEFI_DEPOSIT: ToolMeta = {
  name: 'defi_deposit',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Deposit into a single DeFi opportunity.',
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
    'Withdraw partially or fully from a DeFi position.',
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
    'Move a position from one protocol to another (two-step: withdraw the ' +
    'whole source position, then deposit into the chosen target). YOU pick ' +
    'the target — rank candidates from `defi_list_opportunities` (and the ' +
    'pool-safety oracle when available) and pass the winner explicitly via ' +
    '`to_protocol_slug` + `to_asset_symbol`.',
  inputSchema: {
    type: 'object',
    properties: {
      from_position_id: {
        type: 'string',
        description:
          'Id of the position to exit (from `defi_list_positions`).',
      },
      to_protocol_slug: {
        type: 'string',
        description:
          'Target protocol slug to move into, e.g. "aave-v3-base-sepolia" ' +
          '(from `defi_list_opportunities`).',
      },
      to_asset_symbol: {
        type: 'string',
        description: 'Asset symbol to deposit into the target, e.g. "USDC".',
      },
      to_asset_contract: ADDRESS_PROP(
        'Optional explicit target ERC20 contract (lowercased). When omitted ' +
          'the executor resolves it from the mobile token registry.',
      ),
      to_amount_raw: {
        type: 'string',
        pattern: '^[0-9]+$',
        description:
          "Optional decimal-string amount in the target asset's smallest " +
          'unit. When omitted the executor redeposits the full amount ' +
          'withdrawn from the source position.',
      },
      expected_apy: {
        type: 'number',
        description:
          'Optional APY hint for the target opportunity; validated against ' +
          'OpportunityCache (±5%).',
      },
    },
    required: ['from_position_id', 'to_protocol_slug', 'to_asset_symbol'],
    additionalProperties: false,
  },
}

const DEFI_CROSS_CHAIN_DEPOSIT: ToolMeta = {
  name: 'defi_cross_chain_deposit',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Bridge tokens cross-chain via LI.FI as the first leg of a deposit into a DeFi opportunity on the destination chain. The destination-chain deposit is a follow-up `defi_deposit` call once bridging completes.',
  inputSchema: {
    type: 'object',
    properties: {
      protocol_slug: {
        type: 'string',
        description:
          'Target adapter selector on the destination chain, e.g. "aave-v3-base".',
      },
      from_chain_id: {
        type: 'integer',
        description: 'Source EVM chain id (where the user holds the funds).',
        minimum: 1,
      },
      to_chain_id: {
        type: 'integer',
        description:
          'Destination EVM chain id. Must match the adapter\'s chain.',
        minimum: 1,
      },
      from_asset_symbol: {
        type: 'string',
        description: 'Source asset symbol, e.g. "USDC".',
      },
      from_asset_contract: ADDRESS_PROP(
        'Optional explicit source ERC20 contract (lowercased). When omitted the executor resolves it from the mobile token registry.',
      ),
      to_asset_contract: ADDRESS_PROP(
        'Optional explicit destination ERC20 contract (lowercased). Defaults to the destination opportunity\'s underlying asset.',
      ),
      amount_raw: {
        type: 'string',
        pattern: '^[0-9]+$',
        description:
          "Decimal-string amount in the source token's smallest unit (bigint-safe).",
      },
      expected_apy: {
        type: 'number',
        description:
          'Optional APY hint for the destination opportunity; validated against OpportunityCache (±5%).',
      },
      expected_tier: {
        type: 'string',
        enum: ['conservative', 'balanced', 'aggressive'],
        description: 'Optional risk-tier hint for the destination opportunity.',
      },
    },
    required: [
      'protocol_slug',
      'from_chain_id',
      'to_chain_id',
      'from_asset_symbol',
      'amount_raw',
    ],
    additionalProperties: false,
  },
}

const DEFI_COMPOUND: ToolMeta = {
  name: 'defi_compound',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Claim accrued rewards on a position and immediately redeposit them into the same protocol (one signed cycle). Spec §21.3 — auto-compound opt-in.',
  inputSchema: {
    type: 'object',
    properties: {
      position_id: {
        type: 'string',
        description: 'Position id to compound (from `defi_list_positions`).',
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
    defi_cross_chain_deposit: DEFI_CROSS_CHAIN_DEPOSIT,
    defi_compound: DEFI_COMPOUND,
  },
)
