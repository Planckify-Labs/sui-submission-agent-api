/**
 * DeFi specialist runtime config.
 *
 * To run DeFi on a different model, change the ONE constant below to any
 * id in `MODEL_IDS` (e.g. `MODEL_IDS.CLAUDE_SONNET`). Nothing else moves.
 */

import type { AgentRuntimeConfig } from '../agentConfig'
import { MODEL_IDS } from '../models'
import { DEFI_TOOLS } from './tools'
import { DEFI_SYSTEM_PROMPT } from './systemPrompt'

export const defiConfig: AgentRuntimeConfig = {
  id: 'defi',
  model: MODEL_IDS.KIMI_K2, // ← flip to MODEL_IDS.CLAUDE_SONNET to run DeFi on Claude
  buildSystemPrompt: () => DEFI_SYSTEM_PROMPT,
  tools: DEFI_TOOLS,
}
