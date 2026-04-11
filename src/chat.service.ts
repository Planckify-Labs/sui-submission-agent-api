import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createOpenAI } from '@ai-sdk/openai'
import {
  jsonSchema,
  streamText,
  tool as defineTool,
  type LanguageModel,
  type ModelMessage,
  type Tool,
  type ToolSet,
} from 'ai'
import { MCPClientService } from './mcp-client.service'
import { SessionService } from './session'
import { TOOL_REGISTRY, type ToolMeta } from './tools/registry'
import { buildHumanSummary } from './tools/human-summary'
import { buildSystemPrompt } from './agent/system-prompt'
import type {
  MobileResponse,
  Session,
  ToolPendingPayload,
  WalletContext,
} from './session/types'
import { TimeoutError } from './session/types'
import {
  encodeSseEvent,
  type AgentEvent,
  type AgentToolResult,
} from './chat.events'
import { transformResponse } from './mcp/tools/response-transformer'

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

const DEFAULT_MODEL_RUNNER: ModelRunner = ({ model, messages, tools, system }) =>
  streamText({
    model,
    messages,
    tools,
    system,
    maxRetries: 2,
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
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private cachedModel: LanguageModel | null = null
  private modelRunner: ModelRunner = DEFAULT_MODEL_RUNNER

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpClientService: MCPClientService,
    private readonly sessionService: SessionService,
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
    })
    this.cachedModel = kimi.chat('kimi-k2-0711-preview')
    return this.cachedModel
  }

  /**
   * Core resumable agent loop. See AGENT_PROTOCOL.md §9.
   *
   * Emits events (not HTTP frames) — the SSE encoding happens in
   * `streamAgentSSE()`. This keeps the loop pure and easy to unit-test
   * without standing up a Fastify adapter.
   */
  async *agentLoop(session: Session): AsyncGenerator<AgentEvent> {
    const walletCtx = session.wallet_context
    const systemPrompt = buildSystemPrompt(walletCtx)

    // Fetch MCP tools once per turn. The MCP subprocess now only exposes
    // off-chain TakumiPay handlers; blockchain tools live in the central
    // registry and are routed to the mobile executor.
    let mcpTools: ToolSet = {}
    try {
      mcpTools = (await this.mcpClientService.getTools()) as ToolSet
    } catch (err) {
      this.logger.warn(
        `MCP getTools() failed, continuing without server tools: ${(err as Error).message}`,
      )
    }

    const allTools = buildAllTools(TOOL_REGISTRY, mcpTools)

    session.state = 'streaming'

    // Hard cap on loop iterations — defense against a pathological model
    // that keeps emitting tool calls forever. The protocol does not bound
    // this explicitly, but in practice 16 is well above any real turn.
    const MAX_ITERATIONS = 16
    let iterations = 0

    while (iterations++ < MAX_ITERATIONS) {
      yield { event: 'status', data: { message: 'Thinking…' } }

      let call: StreamTextCall
      try {
        call = this.modelRunner({
          model: this.getModel(),
          messages: session.messages,
          tools: allTools,
          system: systemPrompt,
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
      // context the model just produced.
      let assistantText = ''
      try {
        for await (const chunk of call.textStream) {
          assistantText += chunk
          yield { event: 'text_delta', data: { content: chunk } }
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
      }

      if (toolCalls.length === 0) {
        session.state = 'idle'
        yield {
          event: 'done',
          data: { session_id: session.id, usage: session.usage },
        }
        return
      }

      // TODO(parallel-reads): AGENT_PROTOCOL §3 allows `capability: "read"`
      // mobile tools to be fan-out concurrently. First pass runs every
      // tool call sequentially — including reads — to keep the control
      // flow obvious. Revisit once the mobile SDK can handle multiple
      // in-flight `tool_pending` events.
      for (const tc of toolCalls) {
        const meta = TOOL_REGISTRY[tc.toolName]

        if (meta && meta.executor === 'server') {
          yield* this.executeServerTool(session, tc, meta, mcpTools)
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

        const pendingResult = yield* this.executeMobileTool(
          session,
          tc,
          resolvedMeta,
        )
        if (pendingResult === 'timeout') {
          // Loop already yielded the error event and set state.
          return
        }
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
  ): AsyncGenerator<AgentEvent> {
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
      yield {
        event: 'tool_executed',
        data: {
          tool_call_id: tc.toolCallId,
          name: tc.toolName,
          result: { status: 'error', error: message },
        },
      }
      return
    }

    // Agent sees the full (unfiltered) payload. The mobile sees the
    // display-filtered copy.
    session.messages.push(
      toolResultMessage(tc.toolCallId, tc.toolName, transformForAgent(rawResult)),
    )

    yield {
      event: 'tool_executed',
      data: {
        tool_call_id: tc.toolCallId,
        name: tc.toolName,
        result: transformForDisplay(tc.toolName, rawResult),
      },
    }
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
  ): AsyncGenerator<AgentEvent, 'ok' | 'timeout'> {
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

    yield { event: 'tool_pending', data: payload }

    let mobileResult: MobileResponse
    try {
      mobileResult = await awaitPromise
    } catch (err) {
      if (err instanceof TimeoutError) {
        session.state = 'idle'
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
    session.messages.push(toolResultMessage(tc.toolCallId, tc.toolName, agentResult))
    session.state = 'streaming'
    return 'ok'
  }

  /**
   * Pipe `agentLoop` into a `text/event-stream` HTTP `Response`. The
   * controller uses this for fresh turns; the reconnect path stays on
   * `buildReconnectResponse`.
   */
  streamAgentSSE(session: Session): Response {
    const generator = this.agentLoop(session)
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
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
          controller.close()
        }
      },
      cancel() {
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
      for (const payload of session.pendingPayloads.values()) {
        events.push({ event: 'tool_pending', data: payload })
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
    const r = mobileResult.result
    if (r.status === 'success') {
      return {
        status: 'approved_and_executed',
        tx_hash: r.tx_hash,
        data: r.data,
      }
    }
    return {
      status: 'approved_but_failed',
      error: r.error ?? 'Tool execution failed on the mobile wallet.',
    }
  }
  return {
    status: 'rejected',
    reason: mobileResult.reason,
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

    // Mobile tool — schema-only stub. The input shape is intentionally
    // permissive because the canonical mobile schemas live in the mobile
    // SDK tasks, not here.
    out[name] = defineTool({
      description: meta.description,
      inputSchema: jsonSchema<Record<string, unknown>>({
        type: 'object',
        properties: {},
        additionalProperties: true,
      }),
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
    case 'takumipay':
      return 'Looking up TakumiPay…'
    case 'blockchain_read':
      return 'Reading chain state…'
    case 'blockchain_write':
      return 'Preparing transaction…'
    default:
      return 'Working…'
  }
}

/**
 * Build an `ai` SDK tool-result message. We re-serialise through the
 * standard `tool-result` content part shape so downstream providers can
 * map it back into OpenAI-compatible `tool` messages on the next step.
 */
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
 * Display-side filtering for `tool_executed`. Routes through the
 * existing `response-transformer` module so mobile sees the same slim
 * payload the MCP handlers already produce today.
 */
function transformForDisplay(toolName: string, raw: unknown): unknown {
  try {
    return transformResponse(raw, toolName)
  } catch {
    return raw
  }
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
