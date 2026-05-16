/**
 * `core_clarify` — Core's "ask the user a clarifying question" tool.
 *
 * Spec: docs/multi-agent-architecture-spec.md §4.1, §6.1.
 *
 * In-process tool. The orchestrator short-circuits invocations of this
 * tool: it never emits a `tool_pending` to mobile and never reaches a
 * specialist. The output is just the structured question Core wants to
 * pose; the next turn re-enters Core with the user's reply.
 *
 * Hard rule (§4.1): no imports from `services/walletKit`, `services/chains`,
 * `services/defi`, or any external-capability module. Pure data.
 */

import { composeAgentTools } from '../internal/compose'
import type { ToolMeta } from '../internal/types'

const CORE_CLARIFY: ToolMeta = {
  name: 'core_clarify',
  category: 'utility',
  executor: 'server',
  capability: 'read',
  description:
    'Ask the user a single clarifying question when intent is ambiguous. The orchestrator surfaces the question verbatim in the next assistant message; Core resumes on the user reply.',
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description:
          'The clarifying question to ask the user (≤ 200 chars). Hand-written, never echoing raw tool output.',
      },
      reason: {
        type: 'string',
        description:
          'Optional brief internal note explaining why the clarification is needed. Not shown to the user.',
      },
    },
    required: ['question'],
    additionalProperties: false,
  },
}

export const CORE_CLARIFY_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'core',
  {
    core_clarify: CORE_CLARIFY,
  },
)
