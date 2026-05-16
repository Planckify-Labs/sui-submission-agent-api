/**
 * Boot-time entry point — registers every agent's card and returns a
 * frozen ordered list. Called once from the bootstrap module before
 * the server starts listening.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5, §11.1.
 *
 * The shared `agents/manifests/agentManifests.json` is consulted to
 * cross-check prefixes — drift between a card and the manifest is a
 * boot-time failure (the manifest is also the source of truth for the
 * mobile mirror and the `pnpm check:agents` CI lint).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { coreCard } from './core/card'
import { defiCard } from './defi/card'
import { registerAgent, listAgents } from './registry'
import type { AgentCard, AgentId, AgentStatus } from './types'
import { walletCard } from './wallet/card'

type ManifestEntry = {
  id: AgentId
  display_name?: string
  tool_prefixes: string[]
  status: AgentStatus
}

type Manifest = {
  version: number
  agents: ManifestEntry[]
}

const MANIFEST_PATH = resolve(__dirname, 'manifests/agentManifests.json')

function readManifest(): Manifest {
  const text = readFileSync(MANIFEST_PATH, 'utf8')
  return JSON.parse(text) as Manifest
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function crossCheckAgainstManifest(cards: AgentCard[], manifest: Manifest): void {
  const byId = new Map(manifest.agents.map((entry) => [entry.id, entry]))
  for (const card of cards) {
    const entry = byId.get(card.id)
    if (!entry) {
      throw new Error(
        `[agents/loadAgentCards] Invariant violation: card "${card.id}" not declared in agentManifests.json`,
      )
    }
    if (!arraysEqual(card.tool_prefixes, entry.tool_prefixes)) {
      throw new Error(
        `[agents/loadAgentCards] Invariant violation: card "${card.id}" tool_prefixes drifted from agentManifests.json — sync the manifest or fix the card`,
      )
    }
    if (card.status !== entry.status) {
      throw new Error(
        `[agents/loadAgentCards] Invariant violation: card "${card.id}" status="${card.status}" but manifest says "${entry.status}"`,
      )
    }
  }
  // Manifest entries with no matching card (reverse direction).
  for (const entry of manifest.agents) {
    if (!cards.some((c) => c.id === entry.id)) {
      throw new Error(
        `[agents/loadAgentCards] Invariant violation: manifest declares "${entry.id}" but no card is registered`,
      )
    }
  }
}

/**
 * Register every card with the registry, cross-check against the
 * shared manifest, and return the frozen list (Core → Wallet → DeFi).
 *
 * Idempotent in the sense that boot calls it once; re-entry is a
 * programming error (the registry would throw on duplicate id).
 */
export function loadAgentCards(): readonly AgentCard[] {
  const manifest = readManifest()

  // Insertion order is the public contract — Core first, then Wallet,
  // then DeFi (§5 reading order).
  registerAgent(coreCard)
  registerAgent(walletCard)
  registerAgent(defiCard)

  const cards = listAgents()
  crossCheckAgainstManifest(cards, manifest)
  return Object.freeze(cards.slice())
}
