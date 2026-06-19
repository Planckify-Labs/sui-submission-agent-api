/**
 * Wallet specialist runtime config.
 *
 * Change the model constant below to run this agent on any id in `MODEL_IDS`.
 */

import type { AgentRuntimeConfig } from '../agentConfig'
import { MODEL_IDS } from '../models'
import { WALLET_TOOLS } from './tools'
import { WALLET_SYSTEM_PROMPT } from './systemPrompt'

export const walletConfig: AgentRuntimeConfig = {
  id: 'wallet',
  model: MODEL_IDS.KIMI_K2,
  buildSystemPrompt: () => WALLET_SYSTEM_PROMPT,
  tools: WALLET_TOOLS,
}
