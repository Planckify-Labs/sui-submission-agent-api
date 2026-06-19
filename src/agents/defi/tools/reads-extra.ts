/**
 * `defi_get_config` — DeFi config read.
 *
 * Spec: docs/defi-strategies-spec.md §11.
 *
 * Returns the connected wallet's `UserStrategy` row (or `null` when
 * the wallet has never gone through onboarding). The LLM uses this to
 * ground tier / whitelist / liquidity reasoning before proposing a
 * deposit — pairs naturally with `defi_list_opportunities`.
 *
 * Mobile executor: `services/agent-executors/defi/reads.ts` → `getConfig`.
 */

import { composeAgentTools } from '../../../tools/internal/compose'
import type { ToolMeta } from '../../../tools/internal/types'

const DEFI_GET_CONFIG: ToolMeta = {
  name: 'defi_get_config',
  category: 'utility',
  executor: 'mobile',
  capability: 'read',
  description:
    'Return the connected wallet\'s saved DeFi strategy config (tier, whitelist, liquidity preference, allocation, rebalance trigger). Returns null when the wallet has no strategy yet — use this BEFORE proposing any deposit so you know the user\'s safety envelope.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
}

export const DEFI_CONFIG_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'defi',
  {
    defi_get_config: DEFI_GET_CONFIG,
  },
)
