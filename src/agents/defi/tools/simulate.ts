/**
 * `defi_simulate_deposit` — dry-run a deposit.
 *
 * Spec: docs/defi-strategies-spec.md §11.
 *
 * Builds the deposit calldata via the adapter and runs `estimate_gas`
 * against the user's wallet on the target chain. Returns:
 *   • `estimated_gas` (string, decimal wei) or `null` if estimation
 *     failed (typical when the user hasn't approved yet).
 *   • `needs_approval` (bool) — whether the deposit will request an
 *     ERC-20 approval preamble.
 *   • `apy_drift_pct` (number | null) — drift between caller-supplied
 *     `expected_apy` and the backend OpportunityCache value, if both
 *     are present.
 *   • `safety_score` (number | null) — adapter-level static safety
 *     score (0–100) when the adapter exposes one.
 *
 * The LLM uses the result to compose a preview text turn before
 * emitting the real `defi_deposit`.
 *
 * Mobile executor: `services/agent-executors/defi/simulate.ts` →
 * `simulateDeposit`.
 */

import { composeAgentTools } from '../../../tools/internal/compose'
import { ADDRESS_PROP } from '../../../tools/internal/schemas'
import type { ToolMeta } from '../../../tools/internal/types'

const DEFI_SIMULATE_DEPOSIT: ToolMeta = {
  name: 'defi_simulate_deposit',
  category: 'utility',
  executor: 'mobile',
  // Read-only dry run: no signature, no chain mutation — it only builds
  // calldata and runs an `estimate_gas` probe. Classified `read` so the
  // mobile routes it to the `silent` UX treatment and the agent loop never
  // blocks on an approval affordance.
  capability: 'read',
  description:
    'Dry-run a DeFi deposit. Returns gas estimate, approval requirement, APY drift vs the backend cache, and the adapter\'s static safety score. Always call this before `defi_deposit` for amounts above 100 USD or when the user asks "how much gas will this cost?".',
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
          'Optional APY hint from agent reasoning; surfaced back as `apy_drift_pct` for the LLM to evaluate vs the live cache.',
      },
    },
    required: ['protocol_slug', 'chain_id', 'asset_symbol', 'amount_raw'],
    additionalProperties: false,
  },
}

export const DEFI_SIMULATE_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'defi',
  {
    defi_simulate_deposit: DEFI_SIMULATE_DEPOSIT,
  },
)
