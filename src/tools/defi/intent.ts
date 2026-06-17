/**
 * `defi_intent_preview` + `defi_intent_execute` — the Sui Intent Engine
 * tools (Sui Overflow 2026 Phase 1, spec §6.1).
 *
 * Both are onchain → `executor: "mobile"`. `defi_intent_preview` is a
 * `read` (it dry-runs + guards, never signs — NOT `simulate`, see spec
 * §1.4); `defi_intent_execute` is a `write` whose standard mobile approval
 * sheet IS the explicit confirmation.
 *
 * Names are FROZEN once shipped (the stub→real discipline in `propose.ts`).
 * The mobile executor owns the real zod validation (`parseIntent`); this
 * `inputSchema` is the LLM-facing guide — symbols + human amounts only, the
 * model never supplies coinTypes / package ids / raw amounts (SI-2).
 */

import { composeAgentTools } from '../internal/compose'
import type { ToolMeta } from '../internal/types'

const DEFI_INTENT_PREVIEW: ToolMeta = {
  name: 'defi_intent_preview',
  category: 'utility',
  executor: 'mobile',
  capability: 'read',
  description:
    'Compile a plain-language DeFi goal on Sui into a Programmable ' +
    'Transaction Block, dry-run it, and run the guardian (slippage / ' +
    'stale-pool / over-concentration). Returns an opaque intent_id, a ' +
    'plain-language summary, the decoded PTB commands, and risk_flags. ' +
    'ALWAYS call this before defi_intent_execute. If any risk_flag has ' +
    'severity "block" (or blocked is true), DO NOT execute — explain the ' +
    'risk and offer to adjust. Express the goal as symbols + human amounts ' +
    '(e.g. swap 5 SUI to USDC); never invent coin types, package ids, or ' +
    'raw amounts. supply/withdraw (Scallop) is Sui-mainnet-only; on testnet ' +
    'offer a swap (DeepBook) instead.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['supply', 'withdraw', 'swap'],
        description: 'The goal type.',
      },
      venue: {
        type: 'string',
        enum: ['scallop'],
        description:
          'For supply/withdraw only: the lending venue (mainnet-only).',
      },
      asset: {
        type: 'string',
        description: 'For supply/withdraw: the asset symbol, e.g. "USDC".',
      },
      fromAsset: {
        type: 'string',
        description: 'For swap: the input asset symbol, e.g. "SUI".',
      },
      toAsset: {
        type: 'string',
        description: 'For swap: the output asset symbol, e.g. "USDC".',
      },
      amount: {
        type: 'object',
        description:
          'Human amount as the user said it. Omit for a full withdraw.',
        properties: {
          human: {
            type: 'string',
            description: 'Amount as the user said it, e.g. "5" or "100".',
          },
        },
        required: ['human'],
      },
      maxSlippageBps: {
        type: 'integer',
        minimum: 1,
        description:
          'For swap: max slippage in basis points (default 50 = 0.5%).',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
}

const DEFI_INTENT_EXECUTE: ToolMeta = {
  name: 'defi_intent_execute',
  category: 'blockchain_write',
  executor: 'mobile',
  capability: 'write',
  description:
    'Sign and execute a PTB previously built by defi_intent_preview, ' +
    'identified by intent_id. The user confirms on the mobile approval ' +
    'sheet before broadcast. Carry the intent_id verbatim from the preview ' +
    'result; never fabricate one. The resulting Sui digest is base58 and is ' +
    'returned in data.digest, not tx_hash.',
  inputSchema: {
    type: 'object',
    properties: {
      intent_id: {
        type: 'string',
        description: 'From defi_intent_preview.',
      },
    },
    required: ['intent_id'],
    additionalProperties: false,
  },
}

export const DEFI_INTENT_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'defi',
  {
    defi_intent_preview: DEFI_INTENT_PREVIEW,
    defi_intent_execute: DEFI_INTENT_EXECUTE,
  },
)
