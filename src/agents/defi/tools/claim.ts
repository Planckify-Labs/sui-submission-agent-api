/**
 * `defi_claim` — claim rewards or matured queued withdrawals.
 *
 * Spec: docs/defi-strategies-spec.md §11, §21.3.
 *
 * Dispatches to the adapter's optional `buildClaim?` capability. Used
 * for:
 *   • Lido: collect matured ETH after a 1–5 day withdrawal queue.
 *   • Ethena: collect USDe after the 7-day sUSDe cooldown.
 *   • Curve / Yearn / GMX: pick up accrued reward tokens.
 *
 * Mobile executor: `services/agent-executors/defi/writes.ts` → `claim`.
 * Routes back through the unified `PendingTxCard` (same lifecycle as
 * `defi_deposit` / `defi_withdraw`).
 */

import { composeAgentTools } from '../../../tools/internal/compose'
import type { ToolMeta } from '../../../tools/internal/types'

const DEFI_CLAIM: ToolMeta = {
  name: 'defi_claim',
  category: 'utility',
  executor: 'mobile',
  capability: 'write',
  description:
    'Claim rewards or matured queued withdrawals on a DeFi position. Use this when `defi_list_positions` shows a position with a pending claim, or when the user explicitly asks to "claim my rewards" / "collect my matured withdrawal".',
  inputSchema: {
    type: 'object',
    properties: {
      position_id: {
        type: 'string',
        description:
          'Position id from `defi_list_positions`. The executor uses it to resolve the adapter and the chain.',
      },
    },
    required: ['position_id'],
    additionalProperties: false,
  },
}

export const DEFI_CLAIM_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'defi',
  {
    defi_claim: DEFI_CLAIM,
  },
)
