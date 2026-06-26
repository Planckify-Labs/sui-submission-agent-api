// LOGGING POLICY — see protocol_v1.1.md §14 Guard F.
// Emit session_id + event_type / tool_name + timing/status ONLY.
// NEVER log `session.messages`, tool call args, tool results, or
// `wallet_context` payloads — they carry user PII (voucher codes,
// balances, redemption details). Error `.message` strings and stack
// traces are allowed; request/response payloads are not.
import { randomUUID } from 'node:crypto'
import { createOpenAI } from '@ai-sdk/openai'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  tool as defineTool,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  streamText,
  type Tool,
  type ToolSet,
} from 'ai'
import {
  buildSystemPrompt,
  buildWalletContextPrompt,
} from './agent/system-prompt'
import {
  type AgentRuntimeConfig,
  getAgentConfig,
  listSpecialistIds,
} from './agents/agentConfig'
import { CORE_CONTINUATION_NOTE } from './agents/core/systemPrompt'
import {
  type CoreDecision,
  decideCoreRoute,
  type OrchestratorEngine,
  type StepResult,
} from './agents/engine'
import { StreamSanitizer, stripMachineryLeak } from './agents/leakFilter'
import { resolveModel } from './agents/models'
import { orchestrate } from './agents/orchestrator'
import {
  type AgentEvent,
  type AgentToolResult,
  encodeSseEvent,
} from './chat.events'
import { ConversationService } from './history/conversation.service'
import { MCPClientService } from './mcp-client.service'
import { SessionService } from './session'
import type {
  MobileResponse,
  Session,
  ToolPendingPayload,
  WalletContext,
} from './session/types'
import { TimeoutError } from './session/types'
import { buildHumanSummary } from './tools/human-summary'
import {
  type JsonSchemaObject,
  TOOL_REGISTRY,
  type ToolMeta,
} from './tools/registry'
import { enabledResourceIds, resolveResourceRequest } from './x402/catalog'

/**
 * Signature the agent loop needs from the language model. The real path
 * uses `streamText` from the `ai` SDK; tests inject a stub that yields a
 * canned sequence of text chunks and tool calls.
 *
 * Returning `toolCalls` as an array instead of a PromiseLike keeps the
 * stub trivial while remaining a subset of `streamText`'s real surface.
 */
export interface StreamTextCall {
  textStream: AsyncIterable<string>
  toolCalls: Promise<
    Array<{ toolCallId: string; toolName: string; input: unknown }>
  >
}

/**
 * Pluggable model runner. `ChatService` uses the real `streamText` by
 * default; tests override this to avoid needing a live `KIMI_K2_API_KEY`.
 */
export type ModelRunner = (params: {
  model: LanguageModel
  messages: ModelMessage[]
  tools: ToolSet
  system: string
}) => StreamTextCall

/**
 * Per-turn config for `runAgentTurn`. Lets the single-agent fallback, the
 * orchestrator's specialist turns, and the per-agent endpoints share one
 * loop implementation while each supplies its own prompt / tools / model.
 */
export interface AgentTurnConfig {
  /** System prompt for this turn (wallet-context header already prepended). */
  system: string
  /** The LLM-facing tool set — ONLY the tools this agent is allowed to call. */
  llmTools: ToolSet
  /** The resolved model this agent runs on. */
  model: LanguageModel
}

/** Pull the `question` string out of a `core_clarify` tool input. */
function readClarifyQuestion(input: unknown): string | undefined {
  if (input && typeof input === 'object' && 'question' in input) {
    const q = (input as { question?: unknown }).question
    if (typeof q === 'string' && q.trim().length > 0) return q
  }
  return undefined
}

/**
 * Hard cap on tokens a single model step may emit. Without it, a model that
 * derails into a degenerate repetition loop — which happens reliably when the
 * same tool error is fed back across iterations (e.g. a failing swap/Scallop
 * preview) — streams text UNBOUNDED. The agent loop's `assistantText += chunk`
 * accumulation plus the AI SDK's per-chunk stream-part allocations then grow
 * the heap until the process OOMs. A generous cap (well above any legitimate
 * reply) bounds each step; the §7 MAX_ITERATIONS bounds the number of steps.
 */
const MAX_OUTPUT_TOKENS = 4096

/**
 * Defense-in-depth char cap on a single assistant turn's buffered text, in
 * case a provider ignores `maxOutputTokens`. Comfortably above any legitimate
 * reply (and above the token cap above) — once exceeded we stop buffering /
 * forwarding chunks but keep draining the stream so `toolCalls` still resolves
 * and the provider connection closes, bounding memory without orphaning state.
 */
const MAX_ASSISTANT_CHARS = 32_000

const DEFAULT_MODEL_RUNNER: ModelRunner = ({
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
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 2,
    // The AI SDK otherwise collapses provider/stream failures into a
    // generic "No output generated. Check the stream for errors." when
    // `.toolCalls` / `.textStream` is awaited downstream. `onError` is
    // the only place the REAL cause (provider 4xx, tool-schema reject,
    // empty completion, context overflow) is exposed — log it so x402
    // and other tool failures are actually diagnosable. Server-side log
    // only; never surfaced to the user (CLAUDE.md).
    onError: ({ error }) => {
      // eslint-disable-next-line no-console
      console.error('[chat.streamText] underlying stream error:', error)
    },
  }) as unknown as StreamTextCall

/**
 * 5 minute default — mirrors `MOBILE_RESULT_TIMEOUT_MS` in SessionService.
 */
const MOBILE_RESULT_TIMEOUT_MS = 5 * 60_000

/**
 * Legacy SSE event shape still used by the reconnect branch. Kept
 * because Task 04's tests assert `event: ...` on the wire — the new
 * `AgentEvent` union is structurally the same.
 */
export interface SseEvent {
  event: string
  data: unknown
}

/**
 * Agent service. Responsibilities:
 *
 *  1. Drive the resumable agent loop (`agentLoop`) — one async generator
 *     per turn that yields `AgentEvent`s until the model stops calling
 *     tools or a fatal error occurs.
 *  2. Wire MCP server tools into the LLM while leaving mobile-executor
 *     tools as schema-only stubs so the LLM can still call them.
 *  3. Expose `streamAgentSSE()` — the controller entry point that pipes
 *     the generator into a `text/event-stream` HTTP response.
 *  4. Preserve the Task 04 reconnect behaviour via `buildReconnectResponse`.
 */
@Injectable()
export class ChatService implements OrchestratorEngine {
  private readonly logger = new Logger(ChatService.name)
  private cachedModel: LanguageModel | null = null
  private modelRunner: ModelRunner = DEFAULT_MODEL_RUNNER

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpClientService: MCPClientService,
    private readonly sessionService: SessionService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Test seam — override the model runner so tests can assert loop
   * behaviour without reaching out to a real LLM. Production code never
   * calls this.
   */
  setModelRunner(runner: ModelRunner): void {
    this.modelRunner = runner
  }

  resetModelRunner(): void {
    this.modelRunner = DEFAULT_MODEL_RUNNER
  }

  /**
   * Remove the `display` slice from every tool-result `ModelMessage`
   * before handing the array to `streamText`. Mobile executors split
   * their payload into `data` (agent-facing, compact) and `display`
   * (UI-facing, rich). The rich slice is persisted in `contentJson`
   * so historical replay renders the same card, but feeding it to
   * the LLM defeats the whole point — the model would re-narrate the
   * catalog / balance list on every turn and eat the token budget.
   *
   * This mirrors what server-tool results already do via
   * `transformForAgent` (which emits a compact copy into
   * `session.messages`) and `transformForDisplay` (which emits the
   * rich copy only into the SSE `tool_executed` event).
   *
   * The returned array is a new structure — the input is NOT mutated
   * so persistence keeps the full payload.
   */
  private stripDisplayForLLM(messages: ModelMessage[]): ModelMessage[] {
    return messages.map((msg) => {
      if (msg.role !== 'tool' || !Array.isArray(msg.content)) return msg
      let changed = false
      const nextContent = (msg.content as unknown[]).map((part) => {
        if (
          !part ||
          typeof part !== 'object' ||
          (part as { type?: unknown }).type !== 'tool-result'
        ) {
          return part
        }
        const tr = part as { output?: unknown }
        if (
          !tr.output ||
          typeof tr.output !== 'object' ||
          (tr.output as { type?: unknown }).type !== 'json'
        ) {
          return part
        }
        const wrapped = tr.output as { type: 'json'; value?: unknown }
        const value = wrapped.value
        if (
          !value ||
          typeof value !== 'object' ||
          !('display' in (value as object))
        ) {
          return part
        }
        changed = true
        const { display: _stripped, ...rest } = value as {
          display?: unknown
          [k: string]: unknown
        }
        return {
          ...(part as object),
          output: { ...wrapped, value: rest },
        }
      })
      return changed
        ? ({ ...msg, content: nextContent } as unknown as ModelMessage)
        : msg
    })
  }

  /**
   * Incrementally flush any session messages added since the last persist.
   * Idempotent — repeated calls without new messages are a no-op. Used
   * by the agent loop after each assistant commit and after each tool
   * result so a mid-turn crash leaves the conversation log consistent
   * with what the user actually saw (task 11 / S1).
   *
   * Errors are logged and swallowed: persistence is best-effort and must
   * never break the live SSE stream.
   */
  private async persistTurnSoFar(session: Session): Promise<void> {
    if (!session.conversationId) return
    const from = session.lastPersistedIndex ?? 0
    if (from >= session.messages.length) return
    const slice = session.messages.slice(from)
    try {
      await this.conversationService.appendMessages(
        session.conversationId,
        slice,
      )
      session.lastPersistedIndex = session.messages.length
    } catch (err) {
      this.logger.warn(
        `Partial-turn persist failed for conversation ${session.conversationId}: ${(err as Error).message}`,
      )
    }
  }

  /**
   * Resolve the `ai` SDK model. Cached after the first successful call.
   * Throws a clear error if `KIMI_K2_API_KEY` is missing — this is only
   * reached by the real runner, never by tests that swap in a stub.
   */
  private getModel(): LanguageModel {
    if (this.cachedModel) return this.cachedModel
    const apiKey = this.configService.get<string>('KIMI_K2_API_KEY')
    if (!apiKey) {
      throw new Error(
        'API key not configured. Please set KIMI_K2_API_KEY in your environment.',
      )
    }
    const kimi = createOpenAI({
      apiKey,
      baseURL: 'https://api.moonshot.ai/v1',
      // Kimi K2.6 enables deep thinking by default and, when thinking is on,
      // every assistant tool-call must carry its `reasoning_content` into
      // the next turn or Moonshot rejects the request. Our agent loop
      // reconstructs assistant messages from text + tool-call parts only
      // (chat.service.ts agentLoop), so we explicitly disable thinking to
      // preserve the non-thinking behavior of the retired k2-0711-preview
      // baseline. @ai-sdk/openai v3 has no native passthrough for the
      // `thinking` field, so we inject it into the outgoing JSON body via
      // the provider's fetch hook.
      fetch: async (input, init) => {
        const bodyType = typeof init?.body
        const bodyLen = typeof init?.body === 'string' ? init.body.length : -1
        let hookApplied = false
        let outBody = init?.body
        if (init?.body && typeof init.body === 'string') {
          try {
            const body = JSON.parse(init.body) as Record<string, unknown>
            body.thinking = { type: 'disabled' }
            outBody = JSON.stringify(body)
            hookApplied = true
          } catch {
            // Non-JSON body — leave the request untouched.
          }
        }
        const hasMessages =
          typeof outBody === 'string' &&
          /"role":"(tool|assistant)"/.test(outBody)
        const startedAt = Date.now()
        this.logger.log(
          `[moonshot.fetch] enter bodyType=${bodyType} inLen=${bodyLen} outLen=${typeof outBody === 'string' ? outBody.length : -1} hookApplied=${hookApplied} hasToolTurn=${hasMessages}`,
        )
        // 60-second per-attempt timeout — mirrors the same guard in models.ts.
        const timeoutSignal = AbortSignal.timeout(60_000)
        const signal = init?.signal
          ? AbortSignal.any([init.signal, timeoutSignal])
          : timeoutSignal
        try {
          const res = await fetch(input as RequestInfo, {
            ...init,
            body: outBody,
            signal,
          })
          this.logger.log(
            `[moonshot.fetch] response status=${res.status} dur=${Date.now() - startedAt}ms`,
          )
          return res
        } catch (err) {
          this.logger.error(
            `[moonshot.fetch] FAILED dur=${Date.now() - startedAt}ms: ${(err as Error).name}: ${(err as Error).message}`,
          )
          throw err
        }
      },
    })
    this.cachedModel = kimi.chat('kimi-k2.6')
    return this.cachedModel
  }

  /**
   * Core resumable agent loop. See AGENT_PROTOCOL.md §9.
   *
   * Emits events (not HTTP frames) — the SSE encoding happens in
   * `streamAgentSSE()`. This keeps the loop pure and easy to unit-test
   * without standing up a Fastify adapter.
   */
  async *agentLoop(
    session: Session,
    priorMessageCount?: number,
  ): AsyncGenerator<AgentEvent> {
    // Single-agent fallback (AGENT_ORCHESTRATOR=single). Runs ONE model with
    // the full tool set + the legacy system prompt — preserved for instant
    // rollback from the multi-agent orchestrator.
    const mcpTools = await this.getMcpTools()
    this.prepareTurnWatermark(session, priorMessageCount)
    const cfg: AgentTurnConfig = {
      system: buildSystemPrompt(session.wallet_context),
      llmTools: buildAllTools(TOOL_REGISTRY, mcpTools),
      model: this.getModel(),
    }
    yield* this.runAgentTurn(session, cfg, mcpTools)
  }

  /** Fetch MCP server tools once per turn (normally empty — see §11). */
  private async getMcpTools(): Promise<ToolSet> {
    try {
      return (await this.mcpClientService.getTools()) as ToolSet
    } catch (err) {
      this.logger.warn(
        `MCP getTools() failed, continuing without server tools: ${(err as Error).message}`,
      )
      return {}
    }
  }

  /** Seed the incremental-persist watermark for this turn (task 11 / S1). */
  private prepareTurnWatermark(
    session: Session,
    priorMessageCount?: number,
  ): void {
    const turnStartMessageCount = priorMessageCount ?? session.messages.length
    if (session.lastPersistedIndex === undefined) {
      session.lastPersistedIndex = turnStartMessageCount
    }
  }

  /**
   * Run one agent's multi-step turn: stream text + tool calls, execute each
   * (server via MCP, mobile via the tool_pending round-trip), feed results
   * back, repeat until the model stops calling tools. Parameterized by `cfg`
   * (system prompt + LLM tool set + model) so the single-agent fallback, the
   * orchestrator's specialist turns, AND the per-agent endpoints all share
   * ONE implementation. Yields the same AgentEvent protocol the mobile app
   * already consumes.
   */
  async *runAgentTurn(
    session: Session,
    cfg: AgentTurnConfig,
    mcpTools: ToolSet,
  ): AsyncGenerator<AgentEvent> {
    session.state = 'streaming'

    // Hard cap on loop iterations — defense against a pathological model
    // that keeps emitting tool calls forever. In practice 16 is well above
    // any real turn; a breach emits a retryable `max_iterations` error.
    // MAX_ITERATIONS: hard cap on agent loop turns — see protocol_v1.1.md §7
    const MAX_ITERATIONS = 16
    let iterations = 0

    // Behavioral guard distinct from MAX_ITERATIONS: if the model keeps
    // emitting tool calls that ALL fail, it is in a doomed retry spiral (the
    // exact pattern that derails the model into the runaway generation the
    // output caps above defend against). Break early with a friendly message
    // instead of burning all 16 iterations re-trying a tool that cannot
    // succeed. Reset to 0 the moment any step makes progress.
    const MAX_CONSECUTIVE_TOOL_FAILURES = 3
    let consecutiveFailedSteps = 0

    // Duplicate-read spin guard. The MAX_CONSECUTIVE_TOOL_FAILURES guard above
    // only catches tools that FAIL; a model that keeps re-issuing the SAME read
    // with the SAME args — `get_balance`, `get_redemption_status` ("call ONCE;
    // do NOT loop") — succeeds each time, resets that guard, and re-narrates on
    // every iteration (a second, quieter flavour of the "repeats itself" bug).
    // `seenReadCalls` records read (name+args) keys. The FIRST time the model
    // re-issues an identical read we treat the turn as spinning and finalize it
    // after this step — we do NOT give the model another iteration to narrate
    // again. (We can't un-send the spinning iteration's text — it has already
    // streamed by the time the tool call is classified — but we can stop ANY
    // further re-narration, which is the most a post-hoc guard can do without
    // abandoning live token streaming.) The set is CLEARED on every write, so a
    // legitimate re-read after a state change (read → transfer → read to
    // confirm) is still allowed.
    const seenReadCalls = new Set<string>()
    let sawDuplicateRead = false

    // Per-TURN stream sanitizer: machinery-leak filter + repetition guard. Cuts
    // the stream off if the model restarts its own answer (Kimi-K2 degenerate
    // repetition — the byte-identical "same block twice" the user sees), and
    // persists across iterations so a re-narration split over two model steps is
    // caught too. See `StreamSanitizer`.
    const sanitizer = new StreamSanitizer()

    while (iterations++ < MAX_ITERATIONS) {
      yield { event: 'status', data: { message: 'Thinking…' } }

      let call: StreamTextCall
      try {
        call = this.modelRunner({
          model: cfg.model,
          // Two defensive passes (both pure):
          //   1. `sanitizeOrphanedToolCalls` — inject `interrupted`
          //      results for assistant `tool_calls` that lack a reply.
          //   2. `dropOrphanedToolResults` — strip `tool` messages
          //      whose ids have no preceding `tool_calls`. Without
          //      this, an out-of-order persistence reload trips the
          //      provider's 400.
          messages: this.stripDisplayForLLM(
            dropOrphanedToolResults(
              sanitizeOrphanedToolCalls(session.messages),
            ),
          ),
          tools: cfg.llmTools,
          system: cfg.system,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(`streamText failed: ${message}`)
        yield {
          event: 'error',
          data: {
            code: 'model_error',
            message,
            retryable: true,
          },
        }
        session.state = 'idle'
        return
      }

      // Stream text chunks as they arrive. Accumulating them here lets us
      // also push one consolidated assistant message into `session.messages`
      // at the end of the step so the next iteration carries the full
      // context the model just produced. Every chunk passes through the
      // machinery-leak filter FIRST, so a leaked "a specialist will…" sentence
      // reaches neither the user nor `assistantText` (and therefore not Core's
      // context on the next hop) — a structural backstop to the prompt rules.
      let assistantText = ''
      let outputTruncated = false
      const emitText = function* (
        text: string,
      ): Generator<AgentEvent, void, unknown> {
        if (!text) return
        if (assistantText.length < MAX_ASSISTANT_CHARS) {
          assistantText += text
          yield { event: 'text_delta', data: { content: text } }
        } else if (!outputTruncated) {
          outputTruncated = true
        }
      }
      try {
        for await (const chunk of call.textStream) {
          // Text passes through the sanitizer (leak filter + repetition guard).
          // Once it trips, `push()` returns '' so nothing more is forwarded —
          // but we keep draining the iterator so `call.toolCalls` resolves and
          // the stream closes cleanly.
          yield* emitText(sanitizer.push(chunk))
        }
        yield* emitText(sanitizer.endStep())
        if (outputTruncated) {
          this.logger.warn(
            'assistant output exceeded MAX_ASSISTANT_CHARS — draining ' +
              'stream without buffering (runaway-generation OOM guard)',
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(`text stream failed: ${message}`)
        yield {
          event: 'error',
          data: {
            code: 'model_error',
            message,
            retryable: true,
          },
        }
        session.state = 'idle'
        return
      }

      let toolCalls: Array<{
        toolCallId: string
        toolName: string
        input: unknown
      }>
      try {
        toolCalls = await call.toolCalls
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(`toolCalls rejected: ${message}`)
        yield {
          event: 'error',
          data: {
            code: 'model_error',
            message,
            retryable: true,
          },
        }
        session.state = 'idle'
        return
      }

      // Repetition guard tripped: the model restarted its own answer, so the
      // streamed text was truncated at the restart. Treat the turn as complete
      // — commit the (de-duplicated) text WITHOUT the degenerate response's tool
      // calls and finalize, rather than executing tools off a runaway response.
      if (sanitizer.stopped) {
        this.logger.warn(
          'agentLoop: repetition guard tripped — model restarted its answer; ' +
            'truncating and finalizing turn',
        )
        if (assistantText.length > 0) {
          session.messages.push({
            role: 'assistant',
            content: [{ type: 'text', text: assistantText }],
          })
        }
        session.state = 'idle'
        await this.persistTurnSoFar(session)
        yield this.emitDone(session)
        return
      }

      // Commit the assistant turn to session history. Even if tool calls
      // exist we need the assistant message in place so the follow-up
      // tool results attach to it with the correct id.
      if (assistantText.length > 0 || toolCalls.length > 0) {
        const assistantMessage: ModelMessage = {
          role: 'assistant',
          content: [
            ...(assistantText.length > 0
              ? [{ type: 'text' as const, text: assistantText }]
              : []),
            ...toolCalls.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            })),
          ],
        }
        session.messages.push(assistantMessage)
        // Flush this assistant message immediately (task 11). If the SSE
        // stream is killed before we get a `tool_result` back, the partial
        // turn still survives in the conversation log instead of vanishing.
        await this.persistTurnSoFar(session)
      }

      if (toolCalls.length === 0) {
        session.state = 'idle'

        // End-of-turn persist — idempotent because `persistTurnSoFar`
        // tracks `lastPersistedIndex` and only writes new messages.
        // Replaces the previous slice-from-turnStart write (task 07) with
        // the incremental path from task 11.
        await this.persistTurnSoFar(session)

        yield this.emitDone(session)
        return
      }

      // TODO(parallel-reads): AGENT_PROTOCOL §3 allows `capability: "read"`
      // mobile tools to be fan-out concurrently. First pass runs every
      // tool call sequentially — including reads — to keep the control
      // flow obvious. Revisit once the mobile SDK can handle multiple
      // in-flight `tool_pending` events.
      // Track per-step progress for the consecutive-failure guard.
      let stepProgressed = false
      let stepFailed = false

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const meta = TOOL_REGISTRY[tc.toolName]
        const capability = meta?.capability ?? 'write'

        // Duplicate-read spin guard (see `seenReadCalls` above). An identical
        // read already made THIS turn is NOT re-dispatched (no card replay, no
        // round-trip); we flag the turn as spinning so it finalizes after this
        // step rather than looping into another re-narration.
        if (capability === 'read') {
          const key = readCallKey(tc.toolName, tc.input)
          if (seenReadCalls.has(key)) {
            sawDuplicateRead = true
            this.logger.warn(
              `agentLoop: duplicate read ${tc.toolName} — finalizing turn ` +
                'instead of re-dispatching / re-narrating',
            )
            // Pair the assistant tool_call with a result so the transcript
            // stays valid (an orphaned tool_call_id trips the provider's 400).
            // `data`-only (no `display`) so nothing renders on the mobile.
            session.messages.push(
              toolResultMessage(tc.toolCallId, tc.toolName, {
                status: 'success',
                data: { duplicate_call: true },
              }),
            )
            await this.persistTurnSoFar(session)
            stepProgressed = true
            continue
          }
          seenReadCalls.add(key)
        }

        if (meta && meta.executor === 'server') {
          // A server tool that returns data is progress; one that throws
          // (MCP down, exception) is a failure and feeds the spiral guard,
          // same as a failed mobile tool.
          const serverResult = yield* this.executeServerTool(
            session,
            tc,
            meta,
            mcpTools,
          )
          if (serverResult === 'failed') stepFailed = true
          else stepProgressed = true
          // A write may change on-chain / points state, so previously-seen
          // reads are no longer duplicates — clear the guard set.
          if (capability === 'write') seenReadCalls.clear()
          continue
        }

        // Unknown tools default to mobile — safer to let the user decide
        // than to silently execute something the registry doesn't know.
        const resolvedMeta: ToolMeta = meta ?? {
          name: tc.toolName,
          category: 'utility',
          executor: 'mobile',
          capability: 'write',
          description: `Unregistered tool ${tc.toolName}`,
        }

        // x402 capability → concrete request (x402-extensibility-spec §6.1).
        // Replaces the old URL pin-hack: the model now picks a `resource`
        // enum id (or calls an x402-bound tool), and the server resolves the
        // URL from the catalog — the model never types a URL (CI-2), so the
        // "model invents a host" failure class the pin-hack patched over
        // cannot occur. The mobile executor still receives `{ url, method,
        // maxSpendUsdc }` exactly as before (N2).
        if (tc.toolName === 'x402_fetch' || resolvedMeta.x402) {
          const input = (
            tc.input && typeof tc.input === 'object' ? tc.input : {}
          ) as Record<string, unknown>
          // Generic `x402_fetch`: id + params from the model input. An
          // x402-bound tool: id is fixed server-side, the tool input IS the
          // domain args.
          const resourceId =
            resolvedMeta.x402?.resourceId ?? String(input.resource ?? '')
          const params = (
            resolvedMeta.x402
              ? input
              : (input.params as Record<string, unknown> | undefined)
          ) as Record<string, unknown> | undefined
          const maxSpend =
            typeof input.maxSpendUsdc === 'number'
              ? input.maxSpendUsdc
              : undefined
          const resolved = resolveResourceRequest(
            resourceId,
            params ?? {},
            maxSpend,
          )
          if (resolved) {
            tc.input = {
              url: resolved.url,
              ...(resolved.method ? { method: resolved.method } : {}),
              ...(resolved.maxSpendUsdc !== undefined
                ? { maxSpendUsdc: resolved.maxSpendUsdc }
                : {}),
              ...(resolved.body !== undefined ? { body: resolved.body } : {}),
            }
          } else {
            // Unknown/disabled capability — log internally only; the mobile
            // executor surfaces friendly copy (CI-5). The schema enum makes
            // this effectively unreachable for `x402_fetch`.
            this.logger.warn(`[x402] unresolved resource capability`)
          }
        }

        const pendingResult = yield* this.executeMobileTool(
          session,
          tc,
          resolvedMeta,
        )
        if (pendingResult === 'timeout') {
          // Pair every remaining tool_call with an interrupted marker.
          // Otherwise the assistant message keeps orphaned tool_call_ids
          // and the next streamText against this session is rejected by
          // OpenAI-compatible providers with a 400.
          let appended = false
          for (let j = i + 1; j < toolCalls.length; j++) {
            const remaining = toolCalls[j]
            session.messages.push(
              toolResultMessage(remaining.toolCallId, remaining.toolName, {
                status: 'approved_but_failed',
                error: 'interrupted',
              }),
            )
            appended = true
          }
          if (appended) await this.persistTurnSoFar(session)
          return
        }
        if (pendingResult === 'failed') stepFailed = true
        else stepProgressed = true
        // A write may change state — clear the duplicate-read guard so a
        // confirming re-read after it is allowed (read → write → read).
        if (resolvedMeta.capability === 'write') seenReadCalls.clear()
      }

      // Duplicate-read spin guard: the model re-issued a read it already made
      // this turn. Don't loop into another model iteration (that's where the
      // pointless re-narration comes from) — stop cleanly here. The narration
      // already streamed stands, so emit the terminal `done` (NOT an error);
      // the orchestrator swallows it mid-turn and the mobile closes normally.
      if (sawDuplicateRead) {
        session.state = 'idle'
        await this.persistTurnSoFar(session)
        yield this.emitDone(session)
        return
      }

      // Doomed-retry guard: a step where every tool failed and nothing
      // progressed counts toward the cap; any progress resets it. Bounds a
      // spiral well below MAX_ITERATIONS and stops feeding the model a growing
      // wall of identical errors (which is what derails it into a runaway).
      if (stepFailed && !stepProgressed) {
        consecutiveFailedSteps++
        if (consecutiveFailedSteps >= MAX_CONSECUTIVE_TOOL_FAILURES) {
          this.logger.warn(
            `agentLoop: ${consecutiveFailedSteps} consecutive all-failed ` +
              'tool steps — breaking to avoid a retry spiral',
          )
          session.state = 'idle'
          await this.persistTurnSoFar(session)
          yield {
            event: 'error',
            data: {
              code: 'tool_failed_repeatedly',
              message:
                "I couldn't complete that after a few tries. Please try " +
                'again or adjust your request.',
              retryable: true,
            },
          }
          return
        }
      } else {
        consecutiveFailedSteps = 0
      }

      // Loop back for the next model step.
    }

    this.logger.warn(`agentLoop hit MAX_ITERATIONS (${MAX_ITERATIONS})`)
    session.state = 'idle'
    yield {
      event: 'error',
      data: {
        code: 'max_iterations',
        message: 'Agent exceeded the maximum number of tool-call iterations.',
        retryable: true,
      },
    }
  }

  // ── Multi-agent orchestration (AGENT_ORCHESTRATOR=multi, default) ────────
  // ChatService implements `OrchestratorEngine`; `orchestrate()` drives the
  // Core→specialist flow. All three methods reuse `runAgentTurn` + the same
  // helpers, so the wire protocol stays identical to the single-agent path.

  /** Build a specialist/Core system prompt: wallet header + agent rules + brief. */
  private buildAgentSystem(
    session: Session,
    config: AgentRuntimeConfig,
    brief?: string,
  ): string {
    const header = buildWalletContextPrompt(session.wallet_context)
    const briefNote = brief
      ? `\n\n## This turn — do ONLY this\n${brief}\n\nThis is the ONLY thing to handle this turn. The user's latest message may bundle other requests that are NOT your job — IGNORE those parts completely. A coordinator routes them to the right specialist separately. Do NOT mention, decline, or suggest workarounds for anything outside this step (e.g. don't say "I can't swap" or point the user to another app) — just do this step and stop.`
      : ''
    return `${header}\n\n${config.buildSystemPrompt()}${briefNote}`
  }

  /** Terminal `done` event (conversation meta + usage). */
  emitDone(session: Session): AgentEvent {
    return {
      event: 'done',
      data: {
        session_id: session.id,
        usage: session.usage,
        ...(session.conversationId !== undefined
          ? { conversation_id: session.conversationId }
          : {}),
        ...(session.conversationTitle !== undefined
          ? { conversation_title: session.conversationTitle }
          : {}),
      },
    }
  }

  /**
   * Core's router model call. Streams any user-facing text Core produces and
   * RETURNS the routing decision. Core's `core_*` tool calls are orchestration
   * signals — never executed against mobile/MCP, never persisted.
   */
  async *runCoreRouter(
    session: Session,
    options?: {
      resuming?: boolean
      turnStartIndex?: number
      ledger?: readonly StepResult[]
    },
  ): AsyncGenerator<AgentEvent, CoreDecision> {
    const resuming = options?.resuming === true
    this.prepareTurnWatermark(session)
    session.state = 'streaming'
    const coreCfg = getAgentConfig('core')
    if (!coreCfg) {
      this.logger.error('Core agent config missing — cannot route.')
      return { kind: 'answered' }
    }

    let model: LanguageModel
    try {
      model = resolveModel(coreCfg.model)
    } catch (err) {
      this.logger.error(`resolveModel(core) failed: ${String(err)}`)
      yield this.modelErrorEvent()
      return { kind: 'answered' }
    }

    yield { event: 'status', data: { message: 'Thinking…' } }

    // STRUCTURED CHANNEL: show Core only history + the user's request
    // (`messages[0..turnStartIndex)`), never this turn's specialist prose or
    // tool-results. Its view of "what happened" comes from the typed `ledger`,
    // injected into the system prompt — so routing can't be driven by parsing
    // (or re-narrating) the specialist's free text. `turnStartIndex` is
    // undefined on the single-agent path; fall back to the full log there.
    const turnStartIndex = options?.turnStartIndex ?? session.messages.length
    const coreMessages = session.messages.slice(0, turnStartIndex)

    // When resuming mid-turn (a specialist just finished a step), append the
    // continuation note + the structured step ledger so Core decides whether to
    // delegate the next step or end the turn — from STATUS, not from narration.
    const baseSystem = this.buildAgentSystem(session, coreCfg)
    const system = resuming
      ? `${baseSystem}\n\n${CORE_CONTINUATION_NOTE}\n\n${formatStepLedger(options?.ledger ?? [])}`
      : baseSystem

    let call: StreamTextCall
    try {
      call = this.modelRunner({
        model,
        messages: this.stripDisplayForLLM(
          dropOrphanedToolResults(sanitizeOrphanedToolCalls(coreMessages)),
        ),
        tools: buildSchemaToolSet(coreCfg.tools),
        system,
      })
    } catch (err) {
      this.logger.error(`Core streamText failed: ${String(err)}`)
      yield this.modelErrorEvent()
      return { kind: 'answered' }
    }

    // BUFFER Core's prose — do NOT stream it live. Core is a SILENT
    // coordinator: its text is shown only when it answers the user DIRECTLY
    // (small talk / capability / a clarifying question). When it routes, the
    // prose is internal rationale ("I need to delegate this to the DeFi
    // specialist…") that must never reach the user, and when it resumes
    // after a specialist the specialist has already replied. Streaming live
    // would leak that rationale and double up the specialist's answer — the
    // exact "repeating itself" symptom. We can only decide route-vs-answer
    // once `toolCalls` resolve, so we buffer first, then choose.
    let text = ''
    try {
      for await (const chunk of call.textStream) {
        if (text.length < MAX_ASSISTANT_CHARS) text += chunk
      }
    } catch (err) {
      this.logger.error(`Core text stream failed: ${String(err)}`)
      yield this.modelErrorEvent()
      return { kind: 'answered' }
    }

    let toolCalls: Array<{
      toolCallId: string
      toolName: string
      input: unknown
    }>
    try {
      toolCalls = await call.toolCalls
    } catch (err) {
      this.logger.error(`Core toolCalls rejected: ${String(err)}`)
      yield this.modelErrorEvent()
      return { kind: 'answered' }
    }

    const decision = decideCoreRoute(toolCalls, listSpecialistIds())

    if (decision.kind === 'route') {
      // Core is delegating — stay SILENT. Drop its prose (internal routing
      // rationale) entirely: not streamed, not persisted. The specialist
      // owns the user-facing narration for this step.
      return decision
    }

    // Answered. Core speaks here and ONLY here. Pick what (if anything) to say.
    const clarify = toolCalls.find((tc) => tc.toolName === 'core_clarify')
    const question = clarify ? readClarifyQuestion(clarify.input) : undefined

    if (resuming && !question) {
      // Mid-turn resume with nothing to add — the specialist already replied.
      // End SILENTLY (no "How can I help?" non-sequitur, no echo of the
      // specialist's answer).
      session.state = 'idle'
      await this.persistTurnSoFar(session)
      return { kind: 'answered' }
    }

    // On a resume we only reach here for a clarifying question. On a fresh
    // turn, surface Core's direct answer (greeting / capability), falling
    // back to a clarifying question, then a safe default.
    const rawReply = resuming
      ? (question as string)
      : text.length > 0
        ? text
        : (question ?? 'How can I help?')
    // Strip any machinery leak from Core's own answer too (it shouldn't leak,
    // but the backstop is uniform). If filtering empties the reply, fall back
    // to a neutral prompt rather than emitting nothing.
    const filteredReply = stripMachineryLeak(rawReply).trim()
    const reply = filteredReply.length > 0 ? filteredReply : 'How can I help?'
    yield { event: 'text_delta', data: { content: reply } }
    session.messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: reply }],
    })
    session.state = 'idle'
    await this.persistTurnSoFar(session)
    return { kind: 'answered' }
  }

  /**
   * Run one specialist's full turn via the shared engine — its prompt + ONLY
   * its tools + its configured model. Emits the terminal `done` via
   * `runAgentTurn`.
   */
  async *runSpecialistTurn(
    session: Session,
    config: AgentRuntimeConfig,
    brief: string,
  ): AsyncGenerator<AgentEvent> {
    let model: LanguageModel
    try {
      model = resolveModel(config.model)
    } catch (err) {
      this.logger.error(`resolveModel(${config.id}) failed: ${String(err)}`)
      yield this.modelErrorEvent()
      return
    }
    const mcpTools = await this.getMcpTools()
    const cfg: AgentTurnConfig = {
      system: this.buildAgentSystem(session, config, brief),
      llmTools: buildAllTools(config.tools, mcpTools),
      model,
    }
    yield* this.runAgentTurn(session, cfg, mcpTools)
  }

  /** Multi-agent entry point: Core routes → specialist runs. */
  async *orchestratedLoop(
    session: Session,
    priorMessageCount?: number,
  ): AsyncGenerator<AgentEvent> {
    this.prepareTurnWatermark(session, priorMessageCount)
    yield* orchestrate(session, this)
  }

  /** Friendly, retryable model failure (raw cause already logged). */
  private modelErrorEvent(): AgentEvent {
    return {
      event: 'error',
      data: {
        code: 'model_error',
        message: 'Something went wrong. Try again?',
        retryable: true,
      },
    }
  }

  /**
   * Execute a server-routed tool via the live MCP client, fold the result
   * into `session.messages` (unfiltered, for the agent) and yield a
   * `tool_executed` event carrying a display-filtered copy.
   */
  private async *executeServerTool(
    session: Session,
    tc: { toolCallId: string; toolName: string; input: unknown },
    meta: ToolMeta,
    mcpTools: ToolSet,
  ): AsyncGenerator<AgentEvent, 'ok' | 'failed'> {
    yield {
      event: 'status',
      data: { message: progressLabel(meta) },
    }

    let rawResult: unknown
    try {
      const mcpTool = mcpTools[tc.toolName] as Tool | undefined
      const execute = (mcpTool as { execute?: Function } | undefined)?.execute
      if (typeof execute !== 'function') {
        throw new Error(
          `Server tool ${tc.toolName} is not available in the MCP client`,
        )
      }
      rawResult = await execute(tc.input, {
        toolCallId: tc.toolCallId,
        messages: session.messages,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Server tool ${tc.toolName} failed: ${message}`)

      // Push the error into agent context so the model can reason about it
      // — same shape the agent uses for mobile `approved_but_failed`.
      session.messages.push(
        toolResultMessage(tc.toolCallId, tc.toolName, {
          status: 'approved_but_failed',
          error: message,
        }),
      )
      // Even errors are persisted incrementally (task 11) so a reload
      // shows the same failure state the agent reasoned over.
      await this.persistTurnSoFar(session)
      yield {
        event: 'tool_executed',
        data: {
          tool_call_id: tc.toolCallId,
          name: tc.toolName,
          result: { status: 'error', error: message },
        },
      }
      // A thrown server tool (MCP unavailable, exception) is a real failure —
      // counts toward the spiral guard, same as a mobile `approved_but_failed`.
      return 'failed'
    }

    // Agent sees the full (unfiltered) payload. The mobile sees the
    // display-filtered copy.
    session.messages.push(
      toolResultMessage(
        tc.toolCallId,
        tc.toolName,
        transformForAgent(rawResult),
      ),
    )
    // Incremental persist (task 11): a server-tool result is a stable
    // checkpoint — flush so the next mid-turn crash doesn't lose it.
    await this.persistTurnSoFar(session)

    yield {
      event: 'tool_executed',
      data: {
        tool_call_id: tc.toolCallId,
        name: tc.toolName,
        result: transformForDisplay(tc.toolName, rawResult),
      },
    }
    // Returned a result (even a payload-level "failed" the model can reason
    // over) → progress, not a dead-end retry. Only a thrown tool is 'failed'.
    return 'ok'
  }

  /**
   * Emit a `tool_pending` event and block until the mobile responds via
   * `POST /chat/respond` (or the 5-minute timeout fires).
   *
   * Returns `'timeout'` if the loop should bail out; `'ok'` otherwise.
   * Errors from the mobile are folded into `session.messages` as
   * structured `AgentToolResult`s — the model decides whether to retry.
   */
  private async *executeMobileTool(
    session: Session,
    tc: { toolCallId: string; toolName: string; input: unknown },
    meta: ToolMeta,
  ): AsyncGenerator<AgentEvent, 'ok' | 'failed' | 'timeout'> {
    const input =
      typeof tc.input === 'object' && tc.input !== null
        ? (tc.input as Record<string, unknown>)
        : {}

    const payload: ToolPendingPayload = {
      session_id: session.id,
      tool_call_id: tc.toolCallId,
      name: tc.toolName,
      input,
      meta: {
        executor: 'mobile',
        capability: meta.capability,
        category: meta.category,
        human_summary: buildHumanSummary(tc.toolName, input),
      },
    }

    // IMPORTANT: register the deferred BEFORE yielding. A `yield` suspends
    // the generator, and consumers that run code between receiving the
    // event and requesting the next one would otherwise race with the
    // loop: the deferred wouldn't exist yet when the mobile responds.
    // Registering first also guarantees reconnect can find the payload
    // in `session.pendingPayloads` the moment the client re-connects.
    const awaitPromise = this.sessionService.awaitMobileResult(
      session.id,
      tc.toolCallId,
      payload,
      { timeoutMs: MOBILE_RESULT_TIMEOUT_MS },
    )

    // Stamp the moment we entered awaiting state. Used by
    // `buildReconnectResponse` (task 12) to decide whether replayed
    // pending payloads should carry an `interrupted_at` hint.
    if (!session.awaitingMobileSince) {
      session.awaitingMobileSince = new Date()
    }

    yield { event: 'tool_pending', data: payload }

    let mobileResult: MobileResponse
    try {
      mobileResult = await awaitPromise
    } catch (err) {
      if (err instanceof TimeoutError) {
        session.state = 'idle'
        // Task 12 / S2: write a deterministic interrupted marker into
        // the conversation log so historical replay renders this call
        // as `⚠︎ Interrupted` without inferring from absence. The
        // translator (task 02) maps `status: 'failed' + error:
        // 'interrupted'` to `state: 'output-error'` + `error: 'interrupted'`.
        session.messages.push(
          toolResultMessage(tc.toolCallId, tc.toolName, {
            status: 'approved_but_failed',
            error: 'interrupted',
          }),
        )
        // Flush the orphan + interrupted marker so the reload state is
        // consistent with what we just told the live client.
        await this.persistTurnSoFar(session)
        yield {
          event: 'error',
          data: {
            code: 'tool_timeout',
            message:
              'No response received from the app. The action was not executed.',
            retryable: true,
            tool_call_id: tc.toolCallId,
          },
        }
        return 'timeout'
      }
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `awaitMobileResult failed for ${tc.toolCallId}: ${message}`,
      )
      session.state = 'idle'
      // Pair the assistant tool_call with a result so the persisted
      // history isn't left with an orphaned tool_call_id. Without this,
      // OpenAI-compatible providers (Moonshot/Kimi included) reject the
      // next streamText request with a 400.
      session.messages.push(
        toolResultMessage(tc.toolCallId, tc.toolName, {
          status: 'approved_but_failed',
          error: message,
        }),
      )
      await this.persistTurnSoFar(session)
      yield {
        event: 'error',
        data: {
          code: 'session_error',
          message,
          retryable: false,
          tool_call_id: tc.toolCallId,
        },
      }
      return 'timeout'
    }

    const agentResult = buildAgentToolResult(mobileResult)
    session.messages.push(
      toolResultMessage(tc.toolCallId, tc.toolName, agentResult),
    )
    // Mobile tool resolved — clear the awaiting watermark so a later
    // reconnect doesn't mistakenly mark this call as interrupted (task 12).
    session.awaitingMobileSince = undefined
    session.state = 'streaming'
    // Incremental persist (task 11): a tool result is a stable checkpoint.
    await this.persistTurnSoFar(session)
    // A failed tool result (the mobile responded, but the action errored) is
    // 'failed' so the loop's spiral guard can count it; a user 'rejected'
    // result is NOT a failure (the user made a choice) and the model should
    // get to acknowledge it, so it counts as progress ('ok').
    return agentResult.status === 'approved_but_failed' ? 'failed' : 'ok'
  }

  /**
   * Pipe `agentLoop` into a `text/event-stream` HTTP `Response`. The
   * controller uses this for fresh turns; the reconnect path stays on
   * `buildReconnectResponse`.
   */
  streamAgentSSE(session: Session, priorMessageCount?: number): Response {
    // Cutover flag: multi-agent orchestrator is the default; set
    // AGENT_ORCHESTRATOR=single for instant rollback to the legacy loop.
    const useMulti = (process.env.AGENT_ORCHESTRATOR ?? 'multi') !== 'single'
    const generator = useMulti
      ? this.orchestratedLoop(session, priorMessageCount)
      : this.agentLoop(session, priorMessageCount)
    return this.sseResponse(session, generator)
  }

  /**
   * Per-agent endpoint entry: run ONE named agent for this turn. `core`
   * runs the full orchestrator (Core routes → specialist); any other id
   * runs that specialist directly (no Core routing). Reuses the same
   * SSE wire protocol + mobile round-trip (`POST /chat/respond`).
   */
  streamSingleAgentSSE(
    session: Session,
    agentId: string,
    priorMessageCount?: number,
  ): Response {
    if (agentId === 'core') {
      return this.sseResponse(
        session,
        this.orchestratedLoop(session, priorMessageCount),
      )
    }
    const config = getAgentConfig(agentId)
    if (!config) {
      // Unknown agent — the controller 404s before this, but stay safe.
      return this.sseResponse(session, this.unknownAgentLoop(session))
    }
    return this.sseResponse(
      session,
      this.singleAgentLoop(session, config, priorMessageCount),
    )
  }

  /** Run a single specialist as the whole turn (no Core brief). */
  private async *singleAgentLoop(
    session: Session,
    config: AgentRuntimeConfig,
    priorMessageCount?: number,
  ): AsyncGenerator<AgentEvent> {
    this.prepareTurnWatermark(session, priorMessageCount)
    yield* this.runSpecialistTurn(session, config, '')
  }

  /** Fallback generator for an unknown agent id. */
  private async *unknownAgentLoop(
    session: Session,
  ): AsyncGenerator<AgentEvent> {
    yield {
      event: 'text_delta',
      data: { content: "That assistant isn't available." },
    }
    yield this.emitDone(session)
  }

  /** Wrap an AgentEvent generator in a `text/event-stream` HTTP Response. */
  private sseResponse(
    session: Session,
    generator: AsyncGenerator<AgentEvent>,
  ): Response {
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Expose a side-channel writer for out-of-loop emitters (delay-hint
        // mini inference). Guarded by `closed` so a hint arriving after the
        // stream has been torn down is silently dropped instead of throwing.
        let closed = false
        session.enqueueExternal = (event) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(encodeSseEvent(event)))
          } catch {
            // Controller was closed between the guard and the enqueue —
            // harmless, the stream is gone anyway.
          }
        }

        try {
          for await (const event of generator) {
            controller.enqueue(encoder.encode(encodeSseEvent(event)))
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          controller.enqueue(
            encoder.encode(
              encodeSseEvent({
                event: 'error',
                data: {
                  code: 'internal_error',
                  message,
                  retryable: false,
                },
              }),
            ),
          )
        } finally {
          closed = true
          session.enqueueExternal = undefined
          controller.close()
        }
      },
      cancel() {
        session.enqueueExternal = undefined
        void generator.return(undefined)
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  /**
   * Delay-hint mini inference — invoked by `POST /chat/progress` when
   * the mobile reports a tool has been pending for >3s. Runs a tiny
   * one-shot call against the same model with a narrow prompt, streams
   * the reassurance tokens back on the still-open SSE as `text_delta`
   * frames, and returns once the mini stream finishes.
   *
   * Guards:
   *   - Silently no-ops when the session doesn't exist, the tool is no
   *     longer pending, or a hint has already been sent for this tool.
   *   - Silently no-ops when the stream has been closed (no
   *     `enqueueExternal` writer on the session).
   *   - Never throws — any model/network failure is logged and dropped.
   */
  async emitDelayHint(sessionId: string, toolCallId: string): Promise<void> {
    const session = this.sessionService.get(sessionId)
    if (!session) return

    // Only speak while the tool is still pending. If the mobile already
    // posted the real result (race), the main loop will carry on on its
    // own — a late hint here would just be noise.
    if (!session.pendingPayloads.has(toolCallId)) return

    // One hint per tool call.
    if (!session.delayHintsSent) session.delayHintsSent = new Set()
    if (session.delayHintsSent.has(toolCallId)) return
    session.delayHintsSent.add(toolCallId)

    const enqueue = session.enqueueExternal
    if (!enqueue) return

    const pending = session.pendingPayloads.get(toolCallId)
    const humanSummary = pending?.meta.human_summary ?? 'the request'

    // Prefix with a paragraph break so the hint reads as a distinct
    // beat in the assistant bubble instead of running into prior text.
    enqueue({ event: 'text_delta', data: { content: '\n\n' } })

    // Keep the user's ORIGINAL request as the only "user" turn so the
    // model treats its language and tone as the signal to mirror. All
    // instructions for the mini inference itself live in the system
    // prompt — otherwise a long English instruction as the last user
    // message biases the reply toward English regardless of what the
    // user actually wrote.
    const lastUser = findLastUserText(session.messages)
    const miniMessages: ModelMessage[] = [
      {
        role: 'user',
        content: lastUser ?? 'Please help me with my wallet.',
      } as ModelMessage,
    ]

    // CRITICAL: the language rule comes FIRST and is phrased neutrally.
    // Earlier versions listed Indonesian filler words as "don't use
    // these" examples, which biased the model into assuming Indonesian
    // was the expected output language even when the user wrote English.
    // Keep all examples language-agnostic.
    const miniSystem = [
      'LANGUAGE RULE (highest priority, read this first):',
      "- Detect the language of the user's message shown below and reply in EXACTLY that same language.",
      '- If the user wrote in English, reply in English. If Indonesian, reply in Indonesian. Mirror whatever language they chose.',
      '- Never switch languages on the user. This rule overrides everything else.',
      '',
      'Role: you are the same assistant that is currently helping the user with a wallet action.',
      `Right now you are processing their request: ${humanSummary}.`,
      'It is taking a few seconds to finish.',
      '',
      'Your ONLY job for this reply:',
      '- Produce ONE short sentence telling the user you are still processing their request.',
      '  Core meaning: "please wait, I am still working on what you asked for".',
      '- Keep the register polite, warm, and professional — like a friendly customer-service reply.',
      '  Clear and calm. Not overly casual, not slangy, not stiff.',
      '- Reference what the user asked for in general terms when it helps clarity.',
      '- Do NOT apologize. Do NOT mention tools, APIs, blockchains, or internals.',
      '- Do NOT call any tools. Just reply with plain text, one sentence.',
    ].join('\n')

    try {
      const call = this.modelRunner({
        model: this.getModel(),
        messages: miniMessages,
        tools: {},
        system: miniSystem,
      })

      for await (const chunk of call.textStream) {
        // Re-check pending state between chunks — if the real tool
        // result arrived mid-stream, stop adding noise to the bubble.
        if (!session.pendingPayloads.has(toolCallId)) break
        enqueue({ event: 'text_delta', data: { content: chunk } })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`emitDelayHint mini inference failed: ${message}`)
      // Fallback to a static line so the user still gets acknowledgement.
      enqueue({
        event: 'text_delta',
        data: { content: 'Hang tight — still working on this for you.' },
      })
    }
  }

  /**
   * SSE reconnect handler — preserved from Task 04. The mobile re-POSTs
   * `/chat` with `{ session_id, messages: [] }` after an SSE drop; the
   * server re-emits any outstanding `tool_pending` payloads so the mobile
   * can recover its approval UI.
   *
   * We deliberately do not re-attach to the in-progress generator. The
   * generator keeps running on the original HTTP connection, and the
   * mobile responds to pending tools via `POST /chat/respond` — not via
   * this reconnect stream.
   */
  buildReconnectResponse(sessionId: string): Response {
    const session = this.sessionService.get(sessionId)

    const events: SseEvent[] = []
    if (!session) {
      events.push({
        event: 'error',
        data: {
          code: 'session_expired',
          message: 'Session expired. Please start a new conversation.',
          retryable: false,
        },
      })
    } else if (session.state === 'awaiting_mobile') {
      // Task 12 / S2: if the awaiting watermark is older than the
      // executor timeout, mark replayed payloads as `interrupted_at` so
      // the client can render them as terminal `⚠︎ Interrupted` rather
      // than guessing from the absence of a tool-result.
      const interruptedAt =
        session.awaitingMobileSince &&
        Date.now() - session.awaitingMobileSince.getTime() >
          MOBILE_RESULT_TIMEOUT_MS
          ? new Date().toISOString()
          : undefined
      for (const payload of session.pendingPayloads.values()) {
        const enriched = interruptedAt
          ? { ...payload, interrupted_at: interruptedAt }
          : payload
        events.push({ event: 'tool_pending', data: enriched })
      }
    } else if (session.state === 'streaming') {
      // No-op: the real agent loop (started by the original POST /chat)
      // keeps streaming on its own HTTP connection. The mobile will pick
      // up any new events once it reconnects that stream. We don't
      // re-attach here because an in-progress generator can only have one
      // consumer.
    }

    const body = events.map(encodeSseEvent).join('')
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }
}

/**
 * Map `MobileResponse` → `AgentToolResult`. The discriminated union is
 * what the agent reasons over — freeform error strings are forbidden.
 */
export function buildAgentToolResult(
  mobileResult: MobileResponse,
): AgentToolResult {
  if (mobileResult.type === 'tool_result') {
    const r = mobileResult.result as {
      status: 'success' | 'failed'
      tx_hash?: `0x${string}`
      data?: unknown
      display?: unknown
      error?: string
      reason?: string
    }
    if (r.status === 'success') {
      return {
        status: 'approved_and_executed',
        tx_hash: r.tx_hash,
        data: r.data,
        // Forward the UI-facing slice onto the persisted payload.
        // Stripped from the LLM prompt by `stripDisplayForLLM`.
        ...(r.display !== undefined ? { display: r.display } : {}),
      }
    }
    return {
      status: 'approved_but_failed',
      error: r.error ?? 'Tool execution failed on the mobile wallet.',
      // Forward the granular sub-reason so the model can choose a recovery
      // (re-preview vs. fix-params vs. retry) instead of branching on `error`
      // alone. Curated string only (the mobile side guarantees this).
      ...(r.reason ? { reason: r.reason } : {}),
    }
  }
  return {
    status: 'rejected',
    reason: mobileResult.reason,
  }
}

/**
 * Clone a tool schema with the live catalog ids injected into the
 * `resource` enum (x402-extensibility-spec §6.1, CI-2). Keeps the static
 * registry pure — the enabled set is data, resolved per build. When the
 * catalog is empty the property is left without an enum (the schema stays
 * valid; the prompt simply carries no resources).
 */
function withResourceEnum(schema: JsonSchemaObject): JsonSchemaObject {
  const ids = enabledResourceIds()
  const resourceProp = schema.properties?.resource
  if (!resourceProp || ids.length === 0) return schema
  return {
    ...schema,
    properties: {
      ...schema.properties,
      resource: { ...resourceProp, enum: ids },
    },
  }
}

/**
 * Convert `TOOL_REGISTRY` + the live MCP tool set into the `ai` SDK
 * `ToolSet` shape `streamText` expects.
 *
 * Server-executor tools forward the MCP tool object verbatim (schema +
 * execute function) so `streamText` sees a tool it can introspect and
 * validate against. The agent loop does NOT rely on the SDK's built-in
 * execute path — it invokes `mcpTools[name].execute()` itself so it can
 * route results through `transformForAgent` / `transformForDisplay`.
 *
 * Mobile-executor tools get a schema-only stub: the LLM can call them
 * but the SDK never attempts to execute them, because the agent loop
 * intercepts mobile calls and suspends on `awaitMobileResult` before
 * any SDK-level execute runs. A permissive `jsonSchema` is used because
 * Task 05 does not own the mobile tool schemas (those land in later
 * tasks alongside the mobile SDK).
 */
export function buildAllTools(
  registry: Record<string, ToolMeta>,
  mcpTools: ToolSet,
): ToolSet {
  const out: ToolSet = {}

  for (const [name, meta] of Object.entries(registry)) {
    if (meta.executor === 'server') {
      const mcpTool = mcpTools[name]
      if (mcpTool) {
        out[name] = mcpTool
      }
      // Server tools with no MCP binding are silently skipped — either
      // the MCP client is unavailable or the tool is still being wired.
      continue
    }

    // Mobile tool — forward the concrete `inputSchema` from the central
    // registry so the LLM sees required parameters (`chain_id`, address
    // patterns, base-10 `*_wei` strings). See protocol v1.1 §3. A tool
    // missing an `inputSchema` is a registry bug; we fall back to a
    // permissive stub so the loop still runs rather than hard-failing.
    const schema =
      meta.inputSchema ??
      ({
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: true,
      } as const)
    // x402-extensibility-spec §6.1: inject the live catalog enum into
    // `x402_fetch.resource` so the model can only pick a configured
    // capability — it can never invent a URL (CI-2).
    const finalSchema =
      name === 'x402_fetch' && meta.inputSchema
        ? withResourceEnum(meta.inputSchema)
        : schema
    out[name] = defineTool({
      description: meta.description,
      inputSchema: jsonSchema<Record<string, unknown>>(
        finalSchema as unknown as Record<string, unknown>,
      ),
    }) as Tool
  }

  return out
}

/**
 * Build a SCHEMA-ONLY tool set (no execute) from every registry entry that
 * has an inputSchema — regardless of `executor`. Used for Core's router
 * turn: `core_handoff` / `core_clarify` are `executor: "server"` affordances
 * that are never run via MCP/mobile (the orchestrator interprets them), so
 * `buildAllTools` would skip them and the model would get an EMPTY tool set
 * and "describe" the call as text instead of emitting a real tool call.
 */
export function buildSchemaToolSet(
  registry: Record<string, ToolMeta>,
): ToolSet {
  const out: ToolSet = {}
  for (const [name, meta] of Object.entries(registry)) {
    if (!meta.inputSchema) continue
    out[name] = defineTool({
      description: meta.description,
      inputSchema: jsonSchema<Record<string, unknown>>(
        meta.inputSchema as unknown as Record<string, unknown>,
      ),
    }) as Tool
  }
  return out
}

/**
 * Short human-readable status label for a running server tool. Kept as a
 * free function so tests can pin the exact strings without reaching into
 * the service.
 */
function progressLabel(meta: ToolMeta): string {
  switch (meta.category) {
    case 'points':
      return 'Looking up points…'
    case 'blockchain_read':
      return 'Reading chain state…'
    case 'blockchain_write':
      return 'Preparing transaction…'
    default:
      return 'Working…'
  }
}

/**
 * Defensive: every assistant `tool-call` must be followed by a matching
 * `tool-result`, otherwise OpenAI-compatible providers (Moonshot/Kimi
 * included) reject the request with a 400. Older sessions persisted
 * before the loop's bail-out fix can carry orphaned tool_calls; this
 * pass injects a synthetic `interrupted` result for any unmatched id
 * immediately after the assistant message that emitted it.
 *
 * Returns a new array; the input is not mutated. Sessions without
 * orphans pay only a single linear scan.
 */
function sanitizeOrphanedToolCalls(messages: ModelMessage[]): ModelMessage[] {
  let needsRewrite = false
  for (let i = 0; i < messages.length && !needsRewrite; i++) {
    const msg = messages[i]
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue
    const ids: Array<{ toolCallId: string; toolName: string }> = []
    for (const part of msg.content as unknown[]) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'tool-call'
      ) {
        const tc = part as { toolCallId?: unknown; toolName?: unknown }
        if (
          typeof tc.toolCallId === 'string' &&
          typeof tc.toolName === 'string'
        ) {
          ids.push({ toolCallId: tc.toolCallId, toolName: tc.toolName })
        }
      }
    }
    if (ids.length === 0) continue
    const answered = new Set<string>()
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j]
      if (next.role !== 'tool' || !Array.isArray(next.content)) break
      for (const part of next.content as unknown[]) {
        if (
          part &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'tool-result'
        ) {
          const id = (part as { toolCallId?: unknown }).toolCallId
          if (typeof id === 'string') answered.add(id)
        }
      }
    }
    if (ids.some((x) => !answered.has(x.toolCallId))) {
      needsRewrite = true
    }
  }
  if (!needsRewrite) return messages

  const out: ModelMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    out.push(msg)
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue
    const ids: Array<{ toolCallId: string; toolName: string }> = []
    for (const part of msg.content as unknown[]) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'tool-call'
      ) {
        const tc = part as { toolCallId?: unknown; toolName?: unknown }
        if (
          typeof tc.toolCallId === 'string' &&
          typeof tc.toolName === 'string'
        ) {
          ids.push({ toolCallId: tc.toolCallId, toolName: tc.toolName })
        }
      }
    }
    if (ids.length === 0) continue
    const answered = new Set<string>()
    let scan = i + 1
    while (scan < messages.length) {
      const next = messages[scan]
      if (next.role !== 'tool' || !Array.isArray(next.content)) break
      for (const part of next.content as unknown[]) {
        if (
          part &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'tool-result'
        ) {
          const id = (part as { toolCallId?: unknown }).toolCallId
          if (typeof id === 'string') answered.add(id)
        }
      }
      scan++
    }
    for (const x of ids) {
      if (answered.has(x.toolCallId)) continue
      out.push(
        toolResultMessage(x.toolCallId, x.toolName, {
          status: 'approved_but_failed',
          error: 'interrupted',
        }),
      )
    }
  }
  return out
}

/**
 * Defensive (inverse of `sanitizeOrphanedToolCalls`): drop any
 * `role: "tool"` message whose `toolCallId`s have no matching
 * preceding `assistant` `tool-call`. Moonshot/Kimi (and every other
 * OpenAI-compatible provider) returns a 400 with
 * `"messages with role 'tool' must be a response to a preceeding
 * message with 'tool_calls'"` otherwise.
 *
 * Cause this guards against: persistence ordering bugs (multiple rows
 * sharing a `createdAt` and coming back out of order), or a stray
 * tool message left over from a malformed earlier turn.
 *
 * Pure; returns a new array. Sessions without orphans pay one linear
 * scan.
 */
function dropOrphanedToolResults(messages: ModelMessage[]): ModelMessage[] {
  const openCallIds = new Set<string>()
  let needsRewrite = false
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content as unknown[]) {
        if (
          part &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'tool-call'
        ) {
          const id = (part as { toolCallId?: unknown }).toolCallId
          if (typeof id === 'string') openCallIds.add(id)
        }
      }
      continue
    }
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as unknown[]) {
        if (
          part &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'tool-result'
        ) {
          const id = (part as { toolCallId?: unknown }).toolCallId
          if (typeof id !== 'string' || !openCallIds.has(id)) {
            needsRewrite = true
          } else {
            openCallIds.delete(id)
          }
        }
      }
    }
  }
  if (!needsRewrite) return messages

  const out: ModelMessage[] = []
  const open2 = new Set<string>()
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content as unknown[]) {
        if (
          part &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'tool-call'
        ) {
          const id = (part as { toolCallId?: unknown }).toolCallId
          if (typeof id === 'string') open2.add(id)
        }
      }
      out.push(msg)
      continue
    }
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      const kept = (msg.content as unknown[]).filter((part) => {
        if (
          !part ||
          typeof part !== 'object' ||
          (part as { type?: unknown }).type !== 'tool-result'
        ) {
          return true
        }
        const id = (part as { toolCallId?: unknown }).toolCallId
        if (typeof id !== 'string') return false
        if (!open2.has(id)) return false
        open2.delete(id)
        return true
      })
      if (kept.length > 0) {
        out.push({ ...msg, content: kept } as ModelMessage)
      }
      continue
    }
    out.push(msg)
  }
  return out
}

/**
 * Build an `ai` SDK tool-result message. We re-serialise through the
 * standard `tool-result` content part shape so downstream providers can
 * map it back into OpenAI-compatible `tool` messages on the next step.
 */
/**
 * Stable, key-order-independent stringify. Used by `readCallKey` so two
 * tool inputs that differ only in property order hash identically.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')
  return `{${body}}`
}

/**
 * Identity key for a read tool call (name + normalized args), used by the
 * duplicate-read spin guard in `runAgentTurn`.
 */
function readCallKey(toolName: string, input: unknown): string {
  return `${toolName}:${stableStringify(input)}`
}

/**
 * Render the structured step ledger for Core's resume prompt. This is the
 * typed Core⇄specialist channel: Core decides the next step from these status
 * records, NOT by re-reading the specialist's prose from the transcript.
 */
function formatStepLedger(ledger: readonly StepResult[]): string {
  if (ledger.length === 0) {
    return '## Steps handled so far this turn\n(none yet)'
  }
  const lines = ledger.map((s, i) => {
    const outcome = s.status === 'failed' ? 'FAILED' : 'handled'
    const note = s.summary ? ` — said: "${s.summary}"` : ''
    return `${i + 1}. ${s.to} ${outcome} the step "${s.brief}"${note}`
  })
  return `## Steps handled so far this turn\nThese domains have ALREADY been handled by the right specialist (do NOT re-delegate them — see the rule above):\n${lines.join('\n')}`
}

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  result: unknown,
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        output: {
          type: 'json',
          value: result as Parameters<
            typeof JSON.stringify
          >[0] as unknown as Extract<
            ModelMessage,
            { role: 'tool' }
          >['content'][number] extends { output: infer O }
            ? O extends { value: infer V }
              ? V
              : never
            : never,
        },
      },
    ],
  } as ModelMessage
}

/**
 * Response-transformer wrapper used by the agent loop. Server tools
 * already go through `createTransformedResponse` inside their handlers;
 * this is the shape the *agent* sees in its message history. Today it's
 * the identity — the MCP handlers produce a JSON text blob that we hand
 * back to the LLM unchanged. Kept as a seam so later tasks can diverge
 * the agent-facing shape from the display-facing shape.
 */
function transformForAgent(raw: unknown): unknown {
  return raw
}

/**
 * Display-side filtering for `tool_executed`. Previously routed through
 * a domain-specific response-transformer; after protocol v1.1 §11 the
 * server has no domain handlers — any remaining server tools are
 * diagnostic only — so this is the identity. Kept as a seam so later
 * tasks can diverge the agent-facing shape from the display-facing shape.
 */
function transformForDisplay(_toolName: string, raw: unknown): unknown {
  return raw
}

/**
 * Test-only helper — exposes a fresh session pre-populated with user
 * messages so specs can drive `agentLoop` without going through the
 * controller. Kept in this module so the session manipulation stays
 * colocated with the loop that reads it.
 */
export function seedSession(
  service: SessionService,
  walletCtx: WalletContext,
  userText: string,
): Session {
  const session = service.create(walletCtx)
  session.messages.push({
    role: 'user',
    content: userText,
  } as ModelMessage)
  return session
}

/**
 * Generate a deterministic id for a synthetic tool call — only used by
 * the test runner stub. Real tool call ids come from the LLM.
 */
export function syntheticToolCallId(): string {
  return `tc-${randomUUID()}`
}

/**
 * Pull the plain-text content of the most recent user turn out of the
 * session history. Used to give the delay-hint mini inference just
 * enough context to reference what the user asked for, without paying
 * the token cost of the full conversation.
 */
function findLastUserText(messages: ModelMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'user') continue
    const content = msg.content as unknown
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const textPart = content.find(
        (p) => (p as { type?: string })?.type === 'text',
      ) as { text?: string } | undefined
      if (textPart?.text) return textPart.text
    }
    return undefined
  }
  return undefined
}
