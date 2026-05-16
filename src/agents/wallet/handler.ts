/**
 * Wallet handler — thin tool router.
 *
 * Spec: docs/multi-agent-architecture-spec.md §11.2, §11.3.
 *
 * v1 is pure dispatch: when Core emits a wallet-owned tool call (any
 * prefix the Wallet card claims), the orchestrator hands it to this
 * handler which packages it as a `tool_pending` envelope for mobile.
 * NO LLM call is made — this preserves the §11.3 cost contract (one
 * LLM call per turn unless a specialist legitimately needs to reason).
 *
 * `wallet_context` flows through VERBATIM (§9, CLAUDE.md). The handler
 * never re-resolves it, never edits it. The wallet that pays / signs
 * is the wallet the orchestrator pinned at turn start.
 *
 * Errors return structured results — never raw RPC strings (CLAUDE.md).
 */

import { getAgentCard } from '../registry'
import type { AgentTask, WalletContext } from '../types'
import { TOOL_REGISTRY } from '../../tools/registry'

export interface ToolPendingEnvelope {
  origin_agent_id: 'wallet'
  tool_call_id: string
  name: string
  input: Record<string, unknown>
  wallet_context: WalletContext
}

export interface WalletDispatchInput {
  /** Tool name being delegated (e.g. `transfer_erc20`). */
  tool_name: string
  /** Tool inputs from Core's LLM. Opaque to the wallet handler. */
  input: Record<string, unknown>
  /** Server-issued tool_call_id used to thread the eventual result back. */
  tool_call_id: string
}

export interface HandleWalletTaskParams {
  task: AgentTask
  wallet_context: WalletContext
  /** Dispatch payload extracted from `task.input`. */
  dispatch: WalletDispatchInput
}

export type WalletHandlerOutput =
  | { kind: 'tool_pending'; envelope: ToolPendingEnvelope }
  | { kind: 'refused'; reason: string }

/**
 * Resolve a wallet-owned tool call to a `tool_pending` envelope.
 *
 * Out-of-prefix calls (the orchestrator should never send these, but
 * defence in depth) return a structured refusal — never a thrown
 * exception. The orchestrator translates refusals into friendly copy.
 */
export function handleWalletTask(
  params: HandleWalletTaskParams,
): WalletHandlerOutput {
  const { dispatch, wallet_context } = params
  const card = getAgentCard('wallet')
  if (!card) {
    return {
      kind: 'refused',
      reason: 'wallet_card_missing',
    }
  }
  if (!isOwnedByWallet(dispatch.tool_name, card.tool_prefixes)) {
    return {
      kind: 'refused',
      reason: 'out_of_prefix',
    }
  }
  if (!TOOL_REGISTRY[dispatch.tool_name]) {
    return {
      kind: 'refused',
      reason: 'unknown_tool',
    }
  }
  return {
    kind: 'tool_pending',
    envelope: {
      origin_agent_id: 'wallet',
      tool_call_id: dispatch.tool_call_id,
      name: dispatch.tool_name,
      input: dispatch.input,
      wallet_context,
    },
  }
}

function isOwnedByWallet(toolName: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    if (prefix.endsWith('_')) {
      if (toolName.startsWith(prefix)) return true
    } else if (prefix === toolName) {
      return true
    }
  }
  return false
}
