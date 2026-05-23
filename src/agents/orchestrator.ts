/**
 * Multi-agent orchestrator.
 *
 * Spec: docs/multi-agent-architecture-spec.md §6, §9, §11.2.
 * Design notes: docs/multi-agent-design-notes.md §2 (wallet_context
 * isolation — set once, forwarded verbatim, enforced at the seam).
 *
 * Responsibilities (one per turn):
 *   1. Pin `wallet_context` ONCE. Forward verbatim to every specialist
 *      this turn touches (§9, CLAUDE.md dApp bridge isolation +
 *      payment JWT binding). NEVER re-resolve.
 *   2. Run Core's LLM turn (`handleCoreTurn`). Collect text deltas +
 *      tool calls.
 *   3. For each tool call: `dispatch()` resolves the owning agent by
 *      prefix; orchestrator opens an `AgentTask`, runs the specialist
 *      handler, transitions the task, then re-enters Core to summarise
 *      (unless it was a narrative pass-through).
 *   4. Emit SSE frames via the injected `SseSink` — `tool_pending` /
 *      `tool_result` / `narrative_handoff` / `narrative_handoff_end` /
 *      `text_delta` / `assistant_message`. Frames carry `origin_agent_id`
 *      so mobile can render a "via X specialist" badge (Task 17).
 *   5. Catch errors at the seam: log raw in `__DEV__`, surface friendly
 *      copy to the user via Core (CLAUDE.md).
 *
 * Hard rules:
 *   - Specialists never reach mobile directly — every envelope flows
 *     through `sse_sink`, keyed by `tool_call_id`.
 *   - No specialist→specialist delegation in v1 (§15 Q3).
 *   - `wallet_context` is set once and forwarded by reference; the
 *     orchestrator rejects callers that try to edit a specialist's
 *     copy mid-turn.
 */

import type { LanguageModel, ModelMessage } from 'ai'
import { randomUUID } from 'node:crypto'

import { handleCoreTurn, type CoreModelRunner } from './core/handler'
import { handleDefiTask } from './defi/handler'
import {
  handleWalletTask,
  type ToolPendingEnvelope,
} from './wallet/handler'
import type { TaskStore } from './tasks/store'
import { dispatch } from './tools/dispatch'
import type {
  AgentCard,
  AgentId,
  AgentPeerMessage,
  WalletContext,
} from './types'

export type SseFrame =
  | { kind: 'text_delta'; origin_agent_id: AgentId; delta: string }
  | {
      kind: 'tool_pending'
      origin_agent_id: AgentId
      tool_call_id: string
      name: string
      input: Record<string, unknown>
      wallet_context: WalletContext
    }
  | {
      kind: 'tool_result'
      origin_agent_id: AgentId
      tool_call_id: string
      output: unknown
    }
  | { kind: 'narrative_handoff'; origin_agent_id: AgentId }
  | { kind: 'narrative_handoff_end'; origin_agent_id: AgentId }
  | { kind: 'assistant_message'; origin_agent_id: AgentId; text: string }

export interface SseSink {
  emit(frame: SseFrame): void
  /**
   * Wait for the mobile-side response to a `tool_pending` envelope.
   * The orchestrator pairs response → request via `tool_call_id`.
   * Resolves to the `tool_result.data` payload (unknown shape — each
   * tool defines its own).
   */
  awaitMobileResult(toolCallId: string): Promise<unknown>
}

export interface OrchestrateParams {
  conversation_id: string
  user_message: string
  wallet_context: WalletContext
  model: LanguageModel
  store: TaskStore
  sse_sink: SseSink
  /** Optional override for tests (stub the LLM). */
  core_runner?: CoreModelRunner
  /** Conversation history forwarded to Core's LLM (Prisma-shaped). */
  history?: ModelMessage[]
}

export async function orchestrate(
  params: OrchestrateParams,
): Promise<void> {
  // Pin wallet_context for the duration of the turn. The reference is
  // forwarded by identity into every specialist handler — any caller
  // that hands a specialist a different object is breaking §9.
  const wallet_context = Object.freeze({ ...params.wallet_context })

  let coreResult
  try {
    coreResult = handleCoreTurn({
      conversation_id: params.conversation_id,
      user_message: params.user_message,
      wallet_context,
      model: params.model,
      history: params.history,
      runner: params.core_runner,
    })
  } catch (err) {
    // CLAUDE.md user-facing-error rule.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[orchestrator] core handler threw', err)
    }
    params.sse_sink.emit({
      kind: 'assistant_message',
      origin_agent_id: 'core',
      text: "I couldn't complete that — please try again.",
    })
    return
  }

  let assistantText = ''
  for await (const delta of coreResult.textStream) {
    assistantText += delta
    params.sse_sink.emit({
      kind: 'text_delta',
      origin_agent_id: 'core',
      delta,
    })
  }

  const toolCalls = await coreResult.toolCalls

  if (toolCalls.length === 0) {
    if (assistantText.length === 0) {
      // Empty turn — fail safe with a friendly nudge.
      params.sse_sink.emit({
        kind: 'assistant_message',
        origin_agent_id: 'core',
        text: 'How can I help?',
      })
    }
    return
  }

  for (const call of toolCalls) {
    await runOneToolCall({
      call,
      wallet_context,
      conversation_id: params.conversation_id,
      store: params.store,
      sse_sink: params.sse_sink,
    })
  }
}

async function runOneToolCall(args: {
  call: { toolCallId: string; toolName: string; input: unknown }
  wallet_context: Readonly<WalletContext>
  conversation_id: string
  store: TaskStore
  sse_sink: SseSink
}): Promise<void> {
  const { call, wallet_context, store, sse_sink, conversation_id } = args

  // Core's affordances are in-process — they short-circuit before
  // dispatch (§4.1). `core_handoff` may name a specialist via `to`,
  // but the affordance itself is a Core thing: it emits SSE markers
  // (narrative_handoff* frames) without opening an AgentTask.
  if (call.toolName.startsWith('core_')) {
    await handleCoreAffordance({ call, sse_sink })
    return
  }

  const result = dispatch(call.toolName, call.input)

  if (result.kind === 'unknown') {
    sse_sink.emit({
      kind: 'assistant_message',
      origin_agent_id: 'core',
      text: 'I tried to do something I don\'t know how to do yet. Could you rephrase?',
    })
    return
  }

  if (result.kind === 'invalid_handoff') {
    sse_sink.emit({
      kind: 'assistant_message',
      origin_agent_id: 'core',
      text: 'I tried to hand that off but the specialist isn\'t available. Let me try a different approach.',
    })
    return
  }

  const card: AgentCard = result.card

  // Core's own affordances short-circuit — no AgentTask is opened.
  if (card.id === 'core') {
    await handleCoreAffordance({
      call,
      sse_sink,
    })
    return
  }

  const task = await store.createTask({
    conversation_id,
    owner_agent: card.id,
    brief: shortBrief(call.toolName),
    input: { tool_name: call.toolName, input: call.input },
  })
  await store.transitionTask(task.id, 'working')

  try {
    if (card.id === 'wallet') {
      const dispatchResult = handleWalletTask({
        task,
        wallet_context,
        dispatch: {
          tool_name: call.toolName,
          input: (call.input ?? {}) as Record<string, unknown>,
          tool_call_id: call.toolCallId,
        },
      })
      if (dispatchResult.kind === 'refused') {
        await store.transitionTask(task.id, 'failed', {
          reason: dispatchResult.reason,
        })
        sse_sink.emit({
          kind: 'assistant_message',
          origin_agent_id: 'core',
          text: 'I couldn\'t complete that — please try again.',
        })
        return
      }
      const envelope: ToolPendingEnvelope = dispatchResult.envelope
      sse_sink.emit({
        kind: 'tool_pending',
        origin_agent_id: 'wallet',
        tool_call_id: envelope.tool_call_id,
        name: envelope.name,
        input: envelope.input,
        wallet_context: envelope.wallet_context,
      })
      const output = await sse_sink.awaitMobileResult(envelope.tool_call_id)
      sse_sink.emit({
        kind: 'tool_result',
        origin_agent_id: 'wallet',
        tool_call_id: envelope.tool_call_id,
        output,
      })
      await store.transitionTask(task.id, 'completed', output)
      return
    }

    if (card.id === 'defi') {
      const dispatchResult = handleDefiTask({
        task,
        wallet_context,
        dispatch: {
          tool_name: call.toolName,
          input: (call.input ?? {}) as Record<string, unknown>,
          tool_call_id: call.toolCallId,
        },
      })
      if (dispatchResult.kind === 'refused') {
        await store.transitionTask(task.id, 'failed', {
          reason: dispatchResult.reason,
        })
        sse_sink.emit({
          kind: 'assistant_message',
          origin_agent_id: 'core',
          text: "I couldn't complete that — please try again.",
        })
        return
      }
      const envelope = dispatchResult.envelope
      sse_sink.emit({
        kind: 'tool_pending',
        origin_agent_id: 'defi',
        tool_call_id: envelope.tool_call_id,
        name: envelope.name,
        input: envelope.input,
        wallet_context: envelope.wallet_context,
      })
      const output = await sse_sink.awaitMobileResult(envelope.tool_call_id)
      sse_sink.emit({
        kind: 'tool_result',
        origin_agent_id: 'defi',
        tool_call_id: envelope.tool_call_id,
        output,
      })
      await store.transitionTask(task.id, 'completed', output)
      return
    }

    // Future agents: when a new specialist is added per §13, slot a
    // handler call here. Until then, fall through to a structured
    // refusal so Core paraphrases.
    await store.transitionTask(task.id, 'failed', {
      reason: 'unsupported_agent_in_v1',
    })
    sse_sink.emit({
      kind: 'assistant_message',
      origin_agent_id: 'core',
      text: 'I couldn\'t complete that — please try again.',
    })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[orchestrator] specialist task failed', err)
    }
    try {
      await store.transitionTask(task.id, 'failed', {
        reason: 'specialist_threw',
      })
    } catch {
      // Best-effort.
    }
    sse_sink.emit({
      kind: 'assistant_message',
      origin_agent_id: 'core',
      text: 'I couldn\'t complete that — please try again.',
    })
  }
}

async function handleCoreAffordance(args: {
  call: { toolCallId: string; toolName: string; input: unknown }
  sse_sink: SseSink
}): Promise<void> {
  const { call, sse_sink } = args

  if (call.toolName === 'core_clarify') {
    const question = readString(call.input, 'question') ?? 'Could you give me a bit more detail?'
    sse_sink.emit({
      kind: 'assistant_message',
      origin_agent_id: 'core',
      text: question,
    })
    return
  }

  if (call.toolName === 'core_handoff') {
    const conversational = readBool(call.input, 'conversational')
    const to = readString(call.input, 'to')
    if (conversational && to) {
      sse_sink.emit({
        kind: 'narrative_handoff',
        origin_agent_id: to,
      })
      // v1: no specialist narrative path implemented. The orchestrator
      // emits the markers so mobile is exercised end-to-end, then
      // immediately closes — Core resumes narration via the next turn.
      sse_sink.emit({
        kind: 'narrative_handoff_end',
        origin_agent_id: to,
      })
    }
    return
  }
}

function shortBrief(toolName: string): string {
  // PII-free, single-line brief safe for log/audit (CLAUDE.md).
  return `Run ${toolName}`
}

function readString(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const v = (input as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function readBool(input: unknown, key: string): boolean {
  if (input && typeof input === 'object' && key in input) {
    const v = (input as Record<string, unknown>)[key]
    return v === true
  }
  return false
}

// Re-export the peer-message type so callers stay decoupled from the
// underlying file layout.
export type { AgentPeerMessage }
