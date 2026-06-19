/**
 * Core router runtime config.
 *
 * Core holds ONLY `core_*` tools (clarify / handoff) — it never touches a
 * specialist's tools. Its system prompt is built fresh each turn so newly
 * registered specialists appear in the routing guide.
 */

import type { AgentRuntimeConfig } from '../agentConfig'
import { MODEL_IDS } from '../models'
import { CORE_TOOLS } from './tools'
import { buildCoreSystemPrompt } from './systemPrompt'

export const coreConfig: AgentRuntimeConfig = {
  id: 'core',
  model: MODEL_IDS.KIMI_K2,
  buildSystemPrompt: buildCoreSystemPrompt,
  tools: CORE_TOOLS,
}
