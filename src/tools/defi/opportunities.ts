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

import { composeAgentTools } from '../internal/compose'
import type { ToolMeta } from '../internal/types'

const DEFI_LIST_OPPORTUNITIES: ToolMeta = {
  name: 'defi_list_opportunities',
  category: 'utility',
  executor: 'mobile',
  capability: 'read',
  description:
    'List DeFi yield opportunities filtered by tier, chain, asset, or liquidity profile. Use for "show me where I can park USDC" or "what conservative options are on Base".',
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
      chain_id: {
        type: 'integer',
        description: 'Optional chain id filter.',
        minimum: 1,
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
