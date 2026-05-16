/**
 * Agent registry — single source of truth for "which agent owns this tool?".
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5, §4.1, §7.3.
 *
 * Boot-time invariants from §5 are enforced via `assertRegistryInvariants` —
 * a violation `throw`s so a misconfigured registry never produces a
 * running server (CLAUDE.md user-facing-error rule applies: violation
 * messages go to logs only; the orchestrator surfaces friendly copy).
 *
 * No I/O at module load. The registry is pure data the bootstrap
 * module populates by calling `registerAgent` (or `loadAgentCards`).
 */

import type { AgentCard, AgentId } from './types'

/** Insertion-ordered. */
const CARDS = new Map<AgentId, AgentCard>()

/**
 * Register a card. Throws on:
 *  - duplicate `id`
 *  - any `tool_prefix` already owned by another card
 *
 * Fail-loud at boot — a registry that silently dropped a duplicate
 * would route real traffic into the wrong agent.
 */
export function registerAgent(card: AgentCard): void {
  if (CARDS.has(card.id)) {
    throw new Error(
      `[agents/registry] Invariant violation: duplicate agent id "${card.id}"`,
    )
  }
  for (const existing of CARDS.values()) {
    for (const prefix of card.tool_prefixes) {
      if (existing.tool_prefixes.includes(prefix)) {
        throw new Error(
          `[agents/registry] Invariant violation: tool_prefix "${prefix}" already owned by "${existing.id}"`,
        )
      }
    }
  }
  CARDS.set(card.id, card)
}

/**
 * Longest-prefix-wins lookup.
 *
 * An exact entry (e.g. `read_contract`) wins over a hypothetical
 * `read_` family entry. The matcher checks exact-name entries before
 * family prefixes — do not change this ordering without updating the
 * spec §5 lookup contract.
 */
export function getAgentForTool(toolName: string): AgentCard | undefined {
  // Pass 1: exact-name entries (a prefix without a trailing `_` denotes
  // a whole tool name; §5 table includes e.g. `read_contract`).
  for (const card of CARDS.values()) {
    for (const prefix of card.tool_prefixes) {
      if (!prefix.endsWith('_') && prefix === toolName) {
        return card
      }
    }
  }
  // Pass 2: family prefixes (longest wins on ties).
  let best: { card: AgentCard; len: number } | undefined
  for (const card of CARDS.values()) {
    for (const prefix of card.tool_prefixes) {
      if (prefix.endsWith('_') && toolName.startsWith(prefix)) {
        if (!best || prefix.length > best.len) {
          best = { card, len: prefix.length }
        }
      }
    }
  }
  return best?.card
}

export function getAgentCard(id: AgentId): AgentCard | undefined {
  return CARDS.get(id)
}

/** Insertion-ordered: Core → Wallet → DeFi → … (set by load order). */
export function listAgents(): AgentCard[] {
  return Array.from(CARDS.values())
}

/** Test-only — never call from production code. */
export function __resetRegistryForTests(): void {
  CARDS.clear()
}

/**
 * Boot self-check. Throws with a clear, fail-loud error on any
 * §5 invariant violation.
 *
 * @param serverToolNames — every tool key currently registered in the
 *   server tool registry (e.g. `Object.keys(TOOL_REGISTRY)`). Passed
 *   explicitly so this module stays decoupled from the tool layer.
 */
export function assertRegistryInvariants(serverToolNames: string[]): void {
  const cards = listAgents()

  // Invariant 1: no two agents share a tool_prefix.
  const ownerByPrefix = new Map<string, AgentId>()
  for (const card of cards) {
    for (const prefix of card.tool_prefixes) {
      const existing = ownerByPrefix.get(prefix)
      if (existing) {
        throw new Error(
          `[agents/registry] Invariant violation: tool_prefix "${prefix}" claimed by both "${existing}" and "${card.id}"`,
        )
      }
      ownerByPrefix.set(prefix, card.id)
    }
  }

  // Invariant 4 (§4.1): Core's prefixes are exactly ["core_"].
  const core = getAgentCard('core')
  if (core) {
    const prefixes = core.tool_prefixes
    if (prefixes.length !== 1 || prefixes[0] !== 'core_') {
      throw new Error(
        `[agents/registry] Invariant violation: Core declares prefixes ${JSON.stringify(prefixes)} — must be exactly ["core_"] (§4.1)`,
      )
    }
  }

  // Invariant 2: every tool_prefix matches at least one server tool —
  // SOFT check. The server's TOOL_REGISTRY only knows about tools the
  // server schemas declare; mobile may carry additional executors
  // (e.g. TakumiPay-specific `cancel_booking`, `create_purchase`)
  // that haven't been registered server-side yet. A dead prefix on
  // the server is harmless — the orphan-tool check (invariant 3)
  // catches the real bug class (a server tool with no owner). Warn
  // so the gap is visible in logs but don't refuse boot.
  for (const card of cards) {
    for (const prefix of card.tool_prefixes) {
      const matched = serverToolNames.some((name) =>
        prefix.endsWith('_') ? name.startsWith(prefix) : name === prefix,
      )
      if (!matched) {
        // eslint-disable-next-line no-console
        console.warn(
          `[agents/registry] dead prefix "${prefix}" (owned by "${card.id}") matches no server tool — fine if it's mobile-only, suspicious otherwise`,
        )
      }
    }
  }

  // Invariant 3: union of all tool_prefixes covers the server tool
  // registry — no orphan tools.
  for (const name of serverToolNames) {
    const matched = cards.some((card) =>
      card.tool_prefixes.some((prefix) =>
        prefix.endsWith('_') ? name.startsWith(prefix) : name === prefix,
      ),
    )
    if (!matched) {
      throw new Error(
        `[agents/registry] Invariant violation: orphan tool "${name}" — no agent claims it`,
      )
    }
  }
}
