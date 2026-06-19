/**
 * Core tools — orchestration affordances only.
 *
 * Spec: docs/multi-agent-architecture-spec.md §4.1.
 *
 * The exhaustive surface is `core_clarify` + `core_handoff`. This
 * barrel composes both into a single `CORE_TOOLS` map for the
 * registry. Adding a tool here without it being an orchestration
 * affordance violates §4.1 and trips the boot invariant + CI lint.
 */

import type { ToolMeta } from '../../../tools/internal/types'
import { CORE_CLARIFY_TOOLS } from './clarify'
import { CORE_HANDOFF_TOOLS } from './handoff'

export { CORE_CLARIFY_TOOLS } from './clarify'
export { CORE_HANDOFF_TOOLS } from './handoff'

export const CORE_TOOLS: Record<string, ToolMeta> = {
  ...CORE_CLARIFY_TOOLS,
  ...CORE_HANDOFF_TOOLS,
}
