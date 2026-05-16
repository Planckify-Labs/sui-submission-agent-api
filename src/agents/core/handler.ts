/**
 * Core handler — one LLM call per turn.
 *
 * Spec: docs/multi-agent-architecture-spec.md §4.1, §6, §11.2, §11.3.
 * Design notes: docs/multi-agent-design-notes.md §1 (Core has no
 * external tool surface — load-bearing invariant, enforced at boot
 * AND in CI).
 *
 * Core's job is to read the user message, decide what specialist work
 * is needed, and either:
 *   - emit tool calls (orchestrator routes them by prefix), or
 *   - reply with friendly user-facing text.
 *
 * The LLM sees every tool name (Core's two affordances + the wallet
 * and defi tool surface) but Core ITSELF never executes a non-core
 * tool — it just emits the call name and the orchestrator dispatches
 * (§4.1).
 *
 * No imports from `services/walletKit`, `services/chains`,
 * `services/defi`, or any external-capability module — Core stays
 * orchestration-only.
 *
 * `wallet_context` flows through verbatim from the orchestrator entry
 * point (§9). Core never re-resolves or edits it.
 */

import type {
  LanguageModel,
  ModelMessage,
  Tool,
  ToolSet,
} from 'ai'
import { jsonSchema, tool as defineTool, streamText } from 'ai'
import { TOOL_REGISTRY } from '../../tools/registry'
import type { WalletContext } from '../types'
import { PROMPTS } from './prompts'

/**
 * Minimal LLM result shape. Mirrors the existing `StreamTextCall` in
 * `chat.service.ts` so tests can stub it identically.
 */
export interface CoreTurnResult {
  textStream: AsyncIterable<string>
  toolCalls: Promise<
    Array<{ toolCallId: string; toolName: string; input: unknown }>
  >
}

export type CoreModelRunner = (params: {
  model: LanguageModel
  messages: ModelMessage[]
  tools: ToolSet
  system: string
}) => CoreTurnResult

const DEFAULT_CORE_RUNNER: CoreModelRunner = ({
  model,
  messages,
  tools,
  system,
}) =>
  streamText({
    model,
    messages,
    tools,
    system,
    maxRetries: 2,
  }) as unknown as CoreTurnResult

/**
 * Build the LLM-facing `ToolSet` from the server-side `TOOL_REGISTRY`.
 *
 * Core sees the full flat set of tool names — the LLM emits e.g.
 * `defi_deposit` directly, and the orchestrator prefix-routes it to
 * DeFi. Core only "owns" `core_*`, but it must be able to *name* the
 * specialist tools to delegate to them.
 *
 * Server-executed tools (executor: "server") that lack an inputSchema
 * are skipped — the MCP client publishes their schemas elsewhere.
 */
export function buildCoreToolSet(): ToolSet {
  const set: ToolSet = {}
  for (const [name, meta] of Object.entries(TOOL_REGISTRY)) {
    if (!meta.inputSchema) continue
    const t: Tool = defineTool({
      description: meta.description,
      // ai SDK accepts a JSONSchema7-ish shape; our internal
      // `JsonSchemaObject` is a tighter subset of it. Cast through
      // `unknown` since the literal types diverge on optional fields
      // (notably `description` vs the SDK's `description?`).
      inputSchema: jsonSchema(meta.inputSchema as unknown as never),
    })
    set[name] = t
  }
  return set
}

export interface HandleCoreTurnParams {
  conversation_id: string
  user_message: string
  wallet_context: WalletContext
  model: LanguageModel
  history?: ModelMessage[]
  runner?: CoreModelRunner
}

/**
 * Run one Core LLM turn. Returns the streaming result so the
 * orchestrator can pipe text deltas to SSE and dispatch tool calls by
 * prefix.
 *
 * Core's prompt is built from the registry at call time (so newly
 * registered specialists appear without code edits, §13).
 *
 * `wallet_context` is accepted here but not echoed into the LLM
 * prompt — it travels via the orchestrator's tool-pending envelopes to
 * mobile, not via the system prompt. This preserves CLAUDE.md
 * dApp-bridge isolation: Core has no way to "leak" wallet context
 * back into the conversation history.
 */
export function handleCoreTurn(params: HandleCoreTurnParams): CoreTurnResult {
  const runner = params.runner ?? DEFAULT_CORE_RUNNER
  const messages: ModelMessage[] = [
    ...(params.history ?? []),
    { role: 'user', content: params.user_message },
  ]
  return runner({
    model: params.model,
    messages,
    tools: buildCoreToolSet(),
    system: PROMPTS['core.v1'],
  })
}
