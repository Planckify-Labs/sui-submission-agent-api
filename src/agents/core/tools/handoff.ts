/**
 * `core_handoff` — Core delegates a turn to a specialist.
 *
 * Spec: docs/multi-agent-architecture-spec.md §6.1, §6.4.
 *
 * Two modes:
 *  - `conversational: false` (default) — structured delegation. The
 *    orchestrator opens an AgentTask, the specialist returns a payload,
 *    Core resumes narration on its next turn.
 *  - `conversational: true` — narrative pass-through (§6.4). The
 *    orchestrator emits a `narrative_handoff` SSE frame, streams the
 *    specialist's text deltas with the specialist's `origin_agent_id`,
 *    then emits `narrative_handoff_end`. Core does NOT re-enter for
 *    narration. The user sees a "via X specialist" badge.
 *
 * In-process tool — never reaches mobile as `tool_pending`. The
 * `to` field is validated against the agent manifest at the
 * orchestrator boundary; an invalid id is translated to friendly copy
 * (CLAUDE.md user-facing-error rule).
 *
 * §4.1: no imports from `services/walletKit`, `services/chains`,
 * `services/defi`, or any external-capability module. Pure data.
 */

import { composeAgentTools } from '../../../tools/internal/compose'
import type { ToolMeta } from '../../../tools/internal/types'

const CORE_HANDOFF: ToolMeta = {
  name: 'core_handoff',
  category: 'utility',
  executor: 'server',
  capability: 'read',
  description:
    'Delegate the NEXT step of this turn to a specialist that will do the work and reply to the user. Use this whenever the request needs real wallet or DeFi work — you (Core) have NO execution tools of your own, so delegating is how anything gets done. Choose "defi" for swaps / yield / supply / withdraw, "wallet" for balances, transfers, approvals, address book, points, and redemptions. The specialist runs the needed tools and narrates that step; you are then re-entered so you can delegate a further step (possibly to a different specialist) or end the turn. Delegate ONE specialist per call.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description:
          'Agent id of the specialist (e.g. "defi", "wallet"). Validated against the agent manifest at dispatch — unknown ids are reported as a structured error.',
      },
      brief: {
        type: 'string',
        description:
          'Short hand-written brief (≤ 200 chars) explaining what the specialist should do this turn.',
      },
      conversational: {
        type: 'boolean',
        description:
          'When true, the specialist takes over the narrative for one turn and Core does not re-enter. Defaults to false (structured delegation).',
      },
    },
    required: ['to', 'brief'],
    additionalProperties: false,
  },
}

export const CORE_HANDOFF_TOOLS: Record<string, ToolMeta> = composeAgentTools(
  'core',
  {
    core_handoff: CORE_HANDOFF,
  },
)
