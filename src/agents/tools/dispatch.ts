/**
 * Tool → agent dispatch.
 *
 * Spec: docs/multi-agent-architecture-spec.md §6.1, §6.2.
 *
 * Static prefix routing is the hot path: when Core's LLM emits a tool
 * call, this module asks the registry "which agent owns this name?"
 * and the orchestrator hands the task off accordingly. No LLM round-
 * trip; no fuzzy matching.
 *
 * `core_handoff` is the one LLM-driven routing primitive (§6.1); it
 * routes via the `to` field, validated against the same registry.
 */

import { getAgentForTool, getAgentCard } from '../registry'
import type { AgentCard, AgentId } from '../types'

export type DispatchResult =
  | { kind: 'agent'; card: AgentCard }
  | { kind: 'unknown'; toolName: string }
  | { kind: 'invalid_handoff'; to: string }

/**
 * Resolve the owning agent for a tool call.
 *
 * For `core_handoff` we look up the `to` argument against the
 * registry; an unknown id surfaces as `invalid_handoff` so the
 * orchestrator translates to friendly copy (CLAUDE.md).
 */
export function dispatch(
  toolName: string,
  input: unknown,
): DispatchResult {
  if (toolName === 'core_handoff') {
    const to = readTo(input)
    if (!to) {
      return { kind: 'invalid_handoff', to: String(to ?? '') }
    }
    const card = getAgentCard(to as AgentId)
    if (!card) {
      return { kind: 'invalid_handoff', to }
    }
    return { kind: 'agent', card }
  }
  const card = getAgentForTool(toolName)
  if (!card) {
    return { kind: 'unknown', toolName }
  }
  return { kind: 'agent', card }
}

function readTo(input: unknown): string | undefined {
  if (input && typeof input === 'object' && 'to' in input) {
    const to = (input as { to?: unknown }).to
    if (typeof to === 'string' && to.length > 0) return to
  }
  return undefined
}
