/**
 * Agent runtime configuration — the per-agent bundle the engine and the
 * orchestrator read: which model, which system prompt, which tools.
 *
 * Each agent declares its own `config.ts` (co-located with its prompt +
 * tools); this module just aggregates them into a lookup. Adding an agent
 * = add a `config.ts` + one row here.
 *
 * The `AgentRuntimeConfig` type lives here; each `config.ts` imports it
 * type-only, so there is no runtime import cycle.
 */

import type { ModelId } from './models'
import type { AgentId } from './types'
import type { ToolMeta } from '../tools/internal/types'
import { coreConfig } from './core/config'
import { defiConfig } from './defi/config'
import { walletConfig } from './wallet/config'

export interface AgentRuntimeConfig {
  /** Stable agent id; matches the folder name and the AgentCard id. */
  id: AgentId
  /** Which model this agent runs on — a constant from `MODEL_IDS`. */
  model: ModelId
  /** Built fresh per turn (lets Core derive routing from the registry). */
  buildSystemPrompt: () => string
  /**
   * The tools this agent OWNS — the only tools its LLM turn is given.
   * This is the enforcement point for "only this agent can call its tools".
   */
  tools: Record<string, ToolMeta>
}

export const AGENT_CONFIGS: Record<AgentId, AgentRuntimeConfig> = {
  core: coreConfig,
  wallet: walletConfig,
  defi: defiConfig,
}

export function getAgentConfig(id: string): AgentRuntimeConfig | undefined {
  return AGENT_CONFIGS[id]
}

/** Specialist ids Core may route to (everyone except Core itself). */
export function listSpecialistIds(): AgentId[] {
  return Object.keys(AGENT_CONFIGS).filter((id) => id !== 'core')
}
