/**
 * `defi_list_opportunities` / `defi_list_positions` — DeFi reads.
 *
 * Spec: docs/multi-agent-architecture-spec.md §12,
 *       docs/defi-strategies-spec.md §11.
 *
 * Mobile executor lives at `services/agent-executors/defi/reads.ts`
 * and proxies to the live `/strategies/*` backend. Schemas here
 * stay unchanged across the stub → real flip (§14.2).
 */

import { composeAgentTools } from '../../../tools/internal/compose'
import type { ToolMeta } from '../../../tools/internal/types'

const DEFI_LIST_OPPORTUNITIES: ToolMeta = {
  name: 'defi_list_opportunities',
  category: 'utility',
  executor: 'mobile',
  capability: 'read',
  description:
    'List DeFi yield opportunities across every supported chain (EVM, Solana, AND Sui), filtered by tier, chain, namespace, asset, or liquidity profile. Use for "show me where I can park USDC", "what conservative options are on Base", or "earn yield on my Sui USDC". ALWAYS call this for any "earn yield"/"where can I park X" goal — it is the single source for venue choice; pick the best row within the user\'s tier and route by its `namespace` (do NOT make the user name a protocol). Each row carries `namespace`, `chain_id`, and `protocol_slug` (the venue id used by the deposit / Sui-intent tools).',
  inputSchema: {
    type: 'object',
    properties: {
      tier: {
        type: 'string',
        enum: ['conservative', 'balanced', 'aggressive'],
        description: 'Risk tier filter.',
      },
      asset_symbol: {
        type: 'string',
        description: 'Optional asset symbol filter (e.g. "USDC").',
      },
      namespace: {
        type: 'string',
        enum: ['eip155', 'solana', 'sui'],
        description:
          'Optional chain-namespace filter. Use "sui" to surface Sui yield venues (their rows are chain_id 0, so filter by namespace, not chain_id), "eip155" for EVM, "solana" for Solana.',
      },
      chain_id: {
        type: 'integer',
        description:
          'Optional EVM chain id filter (e.g. 8453 for Base). For non-EVM, filter by `namespace` instead — Sui/Solana rows are chain_id 0.',
        minimum: 0,
      },
      liquidity_profile: {
        type: 'string',
        enum: ['instant', 'queued_short', 'queued_long'],
        description: 'Optional liquidity profile filter.',
      },
      amount_usd: {
        type: 'number',
        description: 'Optional minimum-deposit filter, in USD.',
      },
    },
    required: [],
    additionalProperties: false,
  },
}

const DEFI_LIST_POSITIONS: ToolMeta = {
  name: 'defi_list_positions',
  category: 'utility',
  executor: 'mobile',
  capability: 'read',
  description:
    "List the connected wallet's open DeFi positions.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
}

export const DEFI_OPPORTUNITY_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'defi',
  {
    defi_list_opportunities: DEFI_LIST_OPPORTUNITIES,
    defi_list_positions: DEFI_LIST_POSITIONS,
  },
)
