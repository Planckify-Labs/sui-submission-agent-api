/**
 * DeFi handler — real dispatcher.
 *
 * Spec: docs/multi-agent-architecture-spec.md §12.
 *
 * Like the wallet handler, this is a pure dispatcher. Core emits a defi-owned
 * tool call, the orchestrator hands it here, and this handler packages it as a
 * `tool_pending` envelope for mobile.
 */

import { getAgentCard } from '../registry'
import type { AgentTask, WalletContext } from '../types'
import { TOOL_REGISTRY } from '../../tools/registry'

export interface ToolPendingEnvelope {
  origin_agent_id: 'defi'
  tool_call_id: string
  name: string
  input: Record<string, unknown>
  wallet_context: WalletContext
}

export interface DefiDispatchInput {
  tool_name: string
  input: Record<string, unknown>
  tool_call_id: string
}

export interface HandleDefiTaskParams {
  task: AgentTask
  wallet_context: WalletContext
  dispatch: DefiDispatchInput
}

export type DefiHandlerOutput =
  | { kind: 'tool_pending'; envelope: ToolPendingEnvelope }
  | { kind: 'refused'; reason: string }

export function handleDefiTask(
  params: HandleDefiTaskParams,
): DefiHandlerOutput {
  const { dispatch, wallet_context } = params
  const card = getAgentCard('defi')
  if (!card) {
    return {
      kind: 'refused',
      reason: 'defi_card_missing',
    }
  }
  if (!isOwnedByDefi(dispatch.tool_name, card.tool_prefixes)) {
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
      origin_agent_id: 'defi',
      tool_call_id: dispatch.tool_call_id,
      name: dispatch.tool_name,
      input: dispatch.input,
      wallet_context,
    },
  }
}

function isOwnedByDefi(toolName: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    if (prefix.endsWith('_')) {
      if (toolName.startsWith(prefix)) return true
    } else if (prefix === toolName) {
      return true
    }
  }
  return false
}
