/**
 * Multi-agent type primitives.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5, §8.2.
 *
 * Pure type module — NO runtime code, NO Prisma imports. This file must
 * stay safely importable from any layer (server, shared lib, tests)
 * without dragging Prisma's client into the dependency graph.
 *
 * Naming: snake_case fields to match the existing agent-session
 * protocol (`wallet_context`, `chain_id`, …); we borrow A2A semantics
 * (§3) not its camelCase wire format.
 */

// Open-ended AgentId — TS allows future agents to register without
// breaking type narrowing. §13 promises adding a future agent is a
// six-step checklist; collapsing this to a closed union would break
// that promise.
export type AgentId = 'core' | 'wallet' | 'defi' | (string & {})

export type AgentStatus = 'ready' | 'stub' | 'disabled'

export type AgentCard = {
  id: AgentId
  /** Semver, bumped on schema change. */
  version: string
  /** Human-readable display name (debug logs / admin UI). */
  display_name: string
  /** Routing hint for Core's LLM. */
  description: string
  /**
   * Tool name prefixes this agent owns. Entries ending in `_` denote a
   * prefix family (e.g. `defi_`); entries without a trailing `_` denote
   * an exact tool name (e.g. `read_contract`).
   *
   * Always an array, even for single-prefix agents — never special-case.
   */
  tool_prefixes: string[]
  /** Free-form capability tags ("read_balance", "sign_tx", …). */
  capabilities: string[]
  /** Whether wallet_context must be forwarded to this agent. */
  requires_wallet_context: boolean
  /** Whether the paying-wallet JWT is needed. */
  requires_jwt: boolean
  /** Key into the server-side PROMPTS map. */
  default_system_prompt_ref: string
  status: AgentStatus
}

export type AgentTaskStatus = 'pending' | 'working' | 'completed' | 'failed'

/**
 * In-memory AgentTask shape.
 *
 * Distinct from the Prisma `AgentTask` row (Task 14). The orchestrator
 * uses this representation while a task is alive; the store wrapper
 * (Task 15) converts to/from the Prisma row.
 *
 * `input` and `output` are `unknown` — specialist handlers narrow with
 * zod at their own boundary. The orchestrator treats payloads as opaque.
 */
export type AgentTask = {
  id: string
  conversation_id: string
  owner_agent: AgentId
  parent_task_id?: string
  brief: string
  input: unknown
  status: AgentTaskStatus
  output?: unknown
  created_at: Date
  updated_at: Date
}

export type AgentPeerMessageKind = 'ask_user' | 'info' | 'result'

export type AgentPeerMessage = {
  from: AgentId
  to: AgentId
  kind: AgentPeerMessageKind
  body: string
  attachments?: unknown
}

/**
 * Wallet context that pins a turn to a single wallet.
 *
 * CLAUDE.md "dApp bridge isolation" / "payment JWT binding" rules: this
 * context is set ONCE per turn at the orchestrator entry point and
 * forwarded VERBATIM to every specialist (§9). Specialists must not
 * re-resolve from anywhere else.
 *
 * Mirrors the existing `services/agentSession/protocol.ts` shape; kept
 * here as a re-typed export so agent-side code can import without
 * reaching into the session module.
 */
export type WalletContext = {
  address: string
  namespace?: 'eip155' | 'solana' | 'sui'
  chain_id: number
  chain_name?: string
  chain_symbol?: string
  label?: string
  points_authenticated?: boolean
  jwt?: string
}
