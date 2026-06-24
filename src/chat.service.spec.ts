import { ConfigService } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import type { AgentEvent, AgentToolResult } from './chat.events'
import {
  ChatService,
  type ModelRunner,
  type StreamTextCall,
} from './chat.service'
import { ConversationService } from './history/conversation.service'
import { MCPClientService } from './mcp-client.service'
import { SessionService } from './session/session.service'
import type { MobileResponse, Session, WalletContext } from './session/types'

/**
 * Test helpers — a stub MCP client that returns whatever tools the test
 * wants, and a canned `ModelRunner` that replays a pre-scripted sequence
 * of steps (text chunks + tool calls) without needing a real LLM.
 */

const wallet: WalletContext = {
  address: '0x1111111111111111111111111111111111111111',
  chain_id: 137,
  chain_name: 'Polygon',
  chain_symbol: 'MATIC',
  label: 'Test Wallet',
}

class StubMCPClientService {
  public tools: ToolSet = {}
  getTools(): Promise<ToolSet> {
    return Promise.resolve(this.tools)
  }
  onModuleInit() {
    return Promise.resolve()
  }
  onModuleDestroy() {
    return Promise.resolve()
  }
}

// Stub ConversationService — `ChatService.persistTurnSoFar` is a no-op
// when `session.conversationId` is unset (which is the case for every
// `seedSession()` here), but the constructor still needs an injectable.
class StubConversationService {
  getConversation() {
    return Promise.resolve(null)
  }
  createConversation() {
    return Promise.resolve({ id: 'stub-conv', title: 'stub' })
  }
  appendMessages() {
    return Promise.resolve()
  }
  listConversations() {
    return Promise.resolve([])
  }
  deleteConversation() {
    return Promise.resolve()
  }
  updateTitle() {
    return Promise.resolve({ id: 'stub-conv', title: 'stub' })
  }
}

/**
 * Scripted step for the test runner. The runner returns one of these per
 * `streamText` call, in order. When the script runs out, the next call
 * returns an empty step (no text, no tool calls) which the loop
 * interprets as `done`.
 */
interface ScriptedStep {
  text?: string
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>
}

function makeScriptedRunner(script: ScriptedStep[]): ModelRunner {
  let i = 0
  return () => {
    const step: ScriptedStep = script[i++] ?? {}
    const chunks = step.text ? [step.text] : []
    const textStream: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        for (const chunk of chunks) yield chunk
      },
    }
    const call: StreamTextCall = {
      textStream,
      toolCalls: Promise.resolve(step.toolCalls ?? []),
    }
    return call
  }
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

/**
 * Drive an async generator via `.next()` until `predicate` matches or the
 * generator is done. We deliberately avoid `for await ... break` because
 * breaking out of a `for await` loop calls `generator.return()`, which
 * terminates the generator early — the tests below need to keep iterating
 * the SAME generator after receiving `tool_pending` and injecting a mobile
 * response.
 */
async function collectUntil(
  gen: AsyncGenerator<AgentEvent>,
  predicate: (e: AgentEvent) => boolean,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  while (true) {
    const { value, done } = await gen.next()
    if (done) return out
    out.push(value)
    if (predicate(value)) return out
  }
}

async function drain(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  while (true) {
    const { value, done } = await gen.next()
    if (done) return out
    out.push(value)
  }
}

describe('ChatService agent loop', () => {
  let moduleRef: TestingModule
  let chatService: ChatService
  let sessionService: SessionService

  /**
   * Drive a generator to completion, auto-resolving every `tool_pending`
   * with a canned success the moment it is emitted. Used by the
   * duplicate-read tests that need several mobile round-trips in one turn.
   */
  async function drainResolving(
    gen: AsyncGenerator<AgentEvent>,
    session: Session,
    resultFor: (name: string) => Record<string, unknown> = () => ({
      status: 'success',
      data: { ok: true },
    }),
  ): Promise<AgentEvent[]> {
    const out: AgentEvent[] = []
    while (true) {
      const { value, done } = await gen.next()
      if (done) return out
      out.push(value)
      if (value.event === 'tool_pending') {
        sessionService.resolveMobileResult(
          session.id,
          value.data.tool_call_id,
          {
            type: 'tool_result',
            session_id: session.id,
            tool_call_id: value.data.tool_call_id,
            result: resultFor(value.data.name),
          } as unknown as MobileResponse,
        )
      }
    }
  }

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        SessionService,
        {
          provide: ConfigService,
          useValue: {
            // No KIMI_K2_API_KEY — every test injects a stubbed runner so
            // `getModel()` is never actually called.
            get: (key: string, fallback?: string) => fallback,
          },
        },
        { provide: MCPClientService, useClass: StubMCPClientService },
        { provide: ConversationService, useClass: StubConversationService },
      ],
    }).compile()

    chatService = moduleRef.get(ChatService)
    sessionService = moduleRef.get(SessionService)

    // Replace the real `streamText` with the scripted runner that
    // individual tests configure via `chatService.setModelRunner`. Also
    // stub out `getModel()` so it never reaches for a real API key.
    ;(chatService as unknown as { getModel: () => LanguageModel }).getModel =
      () => ({}) as LanguageModel
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  function seedSession(userText: string): Session {
    const session = sessionService.create(wallet)
    session.messages.push({
      role: 'user',
      content: userText,
    } as ModelMessage)
    return session
  }

  it('completes a text-only turn with a `done` event', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([{ text: 'Hello! How can I help you?' }]),
    )

    const session = seedSession('hi')
    const events = await collect(chatService.agentLoop(session))

    expect(events[0]).toEqual({
      event: 'status',
      data: { message: 'Thinking…' },
    })
    expect(events.some((e) => e.event === 'text_delta')).toBe(true)
    const done = events[events.length - 1]
    expect(done.event).toBe('done')
    expect(session.state).toBe('idle')
  })

  // NOTE: After protocol v1.1 §11 the TOOL_REGISTRY no longer contains any
  // `executor: "server"` tools — every TakumiPay handler was removed from
  // the MCP subprocess and re-added as mobile-executed points tools. The
  // server-tool branch of `agentLoop` is still exercised by tools dispatched
  // through the MCP client (e.g. the `owner`/`calculator` diagnostic tools),
  // but no such tool is registered in TOOL_REGISTRY, so the old
  // "executes a server tool without emitting tool_pending" test was dropped.

  it('emits tool_pending for a mobile tool and resumes after tool_result', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-mobile-1',
              toolName: 'send_native_token',
              input: {
                to: '0xdeadbeef00000000000000000000000000000000',
                amount: '0.5',
                chain_name: 'Polygon',
              },
            },
          ],
        },
        { text: 'Sent.' },
      ]),
    )

    const session = seedSession('send 0.5 MATIC')
    const gen = chatService.agentLoop(session)

    const firstEvents = await collectUntil(
      gen,
      (e) => e.event === 'tool_pending',
    )
    const pending = firstEvents[firstEvents.length - 1]
    expect(pending.event).toBe('tool_pending')
    if (pending.event !== 'tool_pending') throw new Error('unreachable')
    expect(pending.data.name).toBe('send_native_token')
    expect(pending.data.meta.capability).toBe('write')
    expect(pending.data.meta.human_summary).toContain('Send')

    // Simulate mobile response.
    sessionService.resolveMobileResult(session.id, 'tc-mobile-1', {
      type: 'tool_result',
      session_id: session.id,
      tool_call_id: 'tc-mobile-1',
      result: { status: 'success', tx_hash: '0xabc' },
    } as MobileResponse)

    const rest = await drain(gen)

    expect(rest.some((e) => e.event === 'done')).toBe(true)

    // Agent's context should contain an `approved_and_executed` result.
    const toolMsg = session.messages.filter((m) => m.role === 'tool').at(-1)
    expect(toolMsg).toBeDefined()
    const content = (
      toolMsg as { content: Array<{ output: { value: unknown } }> }
    ).content[0]
    expect(content.output.value).toMatchObject({
      status: 'approved_and_executed',
      tx_hash: '0xabc',
    } satisfies AgentToolResult)
  })

  it('injects approved_but_failed when mobile reports failure', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-fail',
              toolName: 'send_native_token',
              input: {
                to: '0xdeadbeef00000000000000000000000000000000',
                amount: '1',
                chain_name: 'Polygon',
              },
            },
          ],
        },
        { text: 'Ok, let me try again.' },
      ]),
    )

    const session = seedSession('send 1 MATIC')
    const gen = chatService.agentLoop(session)
    await collectUntil(gen, (e) => e.event === 'tool_pending')

    sessionService.resolveMobileResult(session.id, 'tc-fail', {
      type: 'tool_result',
      session_id: session.id,
      tool_call_id: 'tc-fail',
      result: { status: 'failed', error: 'nonce too low' },
    } as MobileResponse)

    await drain(gen)

    const toolMsg = session.messages
      .filter((m) => m.role === 'tool')
      .at(-1) as unknown as {
      content: Array<{ output: { value: AgentToolResult } }>
    }
    expect(toolMsg.content[0].output.value).toEqual({
      status: 'approved_but_failed',
      error: 'nonce too low',
    })
  })

  it('injects rejected { reason: "user_declined" } on tool_rejected', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-rej',
              toolName: 'send_native_token',
              input: {
                to: '0xdeadbeef00000000000000000000000000000000',
                amount: '1',
                chain_name: 'Polygon',
              },
            },
          ],
        },
        { text: 'Understood.' },
      ]),
    )

    const session = seedSession('send 1 MATIC')
    const gen = chatService.agentLoop(session)
    await collectUntil(gen, (e) => e.event === 'tool_pending')

    sessionService.resolveMobileResult(session.id, 'tc-rej', {
      type: 'tool_rejected',
      session_id: session.id,
      tool_call_id: 'tc-rej',
      reason: 'user_declined',
    } as MobileResponse)

    await drain(gen)

    const toolMsg = session.messages
      .filter((m) => m.role === 'tool')
      .at(-1) as unknown as {
      content: Array<{ output: { value: AgentToolResult } }>
    }
    expect(toolMsg.content[0].output.value).toEqual({
      status: 'rejected',
      reason: 'user_declined',
    })
  })

  it('strips a machinery-leak sentence from the streamed reply', async () => {
    // The model leaks the exact "a specialist will assist you" phrasing. The
    // filter must drop that sentence from BOTH the user stream and the stored
    // assistant message (so Core never re-reads it either).
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          text: 'You have 13.93 SUI. A specialist will assist you with the swap.',
        },
      ]),
    )

    const session = seedSession('check balance and swap')
    const events = await collect(chatService.agentLoop(session))

    const streamed = events
      .filter((e) => e.event === 'text_delta')
      .map((e) => (e as { data: { content: string } }).data.content)
      .join('')
    expect(streamed).toContain('You have 13.93 SUI.')
    expect(streamed.toLowerCase()).not.toContain('specialist')

    const stored = session.messages.find((m) => m.role === 'assistant')
    const storedText = JSON.stringify(stored)
    expect(storedText.toLowerCase()).not.toContain('specialist')
  })

  it('suppresses a model that restarts its whole answer in one turn', async () => {
    // Kimi-K2 degenerate repetition: the model emits its full reply, then emits
    // it AGAIN. The user must see it only ONCE.
    const ANSWER =
      'Berikut 3 rekomendasi produk DeFi untuk yield pasif:\n' +
      '1. Fluid Lending (USDT) — Ethereum.\n' +
      '2. Marinade (mSOL) — Solana.\n' +
      'Semua tanpa IL. Mau mulai dari yang mana?\n'
    chatService.setModelRunner(makeScriptedRunner([{ text: ANSWER + ANSWER }]))

    const session = seedSession('rekomendasiin produk defi dong')
    const events = await collect(chatService.agentLoop(session))

    const streamed = events
      .filter((e) => e.event === 'text_delta')
      .map((e) => (e as { data: { content: string } }).data.content)
      .join('')
    const opener = 'Berikut 3 rekomendasi produk DeFi untuk yield pasif:'
    expect(streamed.split(opener).length - 1).toBe(1) // opener appears once
    expect(events.some((e) => e.event === 'done')).toBe(true)
  })

  it('blocks an identical re-read in one turn (duplicate-read spin guard)', async () => {
    // The model calls the SAME read with the SAME args twice, then writes a
    // closing line. The 2nd read must NOT be re-dispatched to mobile — only
    // ONE tool_pending should reach the client — and the transcript must carry
    // a synthetic `duplicate_call` result so the assistant tool_call is paired.
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            { toolCallId: 'r1', toolName: 'get_wallet_balance', input: {} },
          ],
        },
        {
          toolCalls: [
            { toolCallId: 'r2', toolName: 'get_wallet_balance', input: {} },
          ],
        },
        { text: 'You have 10 USDC.' },
      ]),
    )

    const session = seedSession('check my balance')
    const events = await drainResolving(chatService.agentLoop(session), session)

    const pendings = events.filter((e) => e.event === 'tool_pending')
    expect(pendings).toHaveLength(1)
    expect(events.some((e) => e.event === 'done')).toBe(true)

    const dupResult = session.messages.find(
      (m) =>
        m.role === 'tool' &&
        (
          m as {
            content: Array<{
              output?: { value?: { data?: { duplicate_call?: boolean } } }
            }>
          }
        ).content[0]?.output?.value?.data?.duplicate_call === true,
    )
    expect(dupResult).toBeDefined()
  })

  it('allows a re-read AFTER a write (read → write → read is not a duplicate)', async () => {
    // A confirming re-read after a state-changing write is legitimate — the
    // guard set is cleared on every write — so BOTH reads must dispatch.
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            { toolCallId: 'b1', toolName: 'get_wallet_balance', input: {} },
          ],
        },
        {
          toolCalls: [
            {
              toolCallId: 'w1',
              toolName: 'send_native_token',
              input: {
                to: '0xdeadbeef00000000000000000000000000000000',
                amount: '1',
                chain_name: 'Polygon',
              },
            },
          ],
        },
        {
          toolCalls: [
            { toolCallId: 'b2', toolName: 'get_wallet_balance', input: {} },
          ],
        },
        { text: 'Done — your new balance is 9 MATIC.' },
      ]),
    )

    const session = seedSession('send 1 MATIC then check balance')
    const events = await drainResolving(
      chatService.agentLoop(session),
      session,
      (name) =>
        name === 'send_native_token'
          ? { status: 'success', tx_hash: '0xabc' }
          : { status: 'success', data: { ok: true } },
    )

    const balancePendings = events.filter(
      (e) => e.event === 'tool_pending' && e.data.name === 'get_wallet_balance',
    )
    expect(balancePendings).toHaveLength(2)
    expect(events.some((e) => e.event === 'done')).toBe(true)
  })

  it('yields tool_timeout error and exits cleanly when mobile never responds', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-timeout',
              toolName: 'send_native_token',
              input: {
                to: '0xdeadbeef00000000000000000000000000000000',
                amount: '1',
                chain_name: 'Polygon',
              },
            },
          ],
        },
      ]),
    )

    // Shorten the timeout via a jest spy so the test runs in real time.
    // We intercept `awaitMobileResult` to force a tiny timeout regardless
    // of the 5-minute default the loop asks for.
    const originalAwait = sessionService.awaitMobileResult.bind(sessionService)
    const awaitSpy = jest
      .spyOn(sessionService, 'awaitMobileResult')
      .mockImplementation((sessionId, toolCallId, payload) =>
        originalAwait(sessionId, toolCallId, payload, { timeoutMs: 50 }),
      )

    const session = seedSession('send 1 MATIC')
    const gen = chatService.agentLoop(session)

    const collected = await drain(gen)

    const err = collected.find((e) => e.event === 'error')
    expect(err).toBeDefined()
    if (err?.event === 'error') {
      expect(err.data.code).toBe('tool_timeout')
      expect(err.data.retryable).toBe(true)
      expect(err.data.tool_call_id).toBe('tc-timeout')
    }

    // Session stays alive so the caller can retry.
    expect(sessionService.get(session.id)).toBeDefined()

    awaitSpy.mockRestore()
  })

  it('reconnect flow: tool_pending re-emitted, responded, loop completes', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-recon',
              toolName: 'send_native_token',
              input: {
                to: '0xdeadbeef00000000000000000000000000000000',
                amount: '0.1',
                chain_name: 'Polygon',
              },
            },
          ],
        },
        { text: 'Done.' },
      ]),
    )

    const session = seedSession('send 0.1 MATIC')
    const gen = chatService.agentLoop(session)

    // Drive the loop until it suspends on the mobile tool.
    await collectUntil(gen, (e) => e.event === 'tool_pending')

    // Simulate an SSE reconnect — mobile re-POSTs /chat with
    // { session_id, messages: [] }. The server re-emits pending payloads.
    const reconnectResp = chatService.buildReconnectResponse(session.id)
    const reconnectBody = await reconnectResp.text()
    expect(reconnectBody).toContain('event: tool_pending')
    expect(reconnectBody).toContain('"tool_call_id":"tc-recon"')

    // Mobile responds via /chat/respond (same deferred — the original
    // generator is still blocked on `awaitMobileResult`).
    sessionService.resolveMobileResult(session.id, 'tc-recon', {
      type: 'tool_result',
      session_id: session.id,
      tool_call_id: 'tc-recon',
      result: { status: 'success', tx_hash: '0xdef' },
    } as MobileResponse)

    // The original loop should now drive to `done`.
    const tail = await drain(gen)
    expect(tail.some((e) => e.event === 'done')).toBe(true)
    expect(session.state).toBe('idle')
  })
})
