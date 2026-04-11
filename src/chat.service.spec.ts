import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import { ChatService, type ModelRunner, type StreamTextCall } from './chat.service'
import { MCPClientService } from './mcp-client.service'
import { SessionService } from './session/session.service'
import type {
  AgentEvent,
  AgentToolResult,
} from './chat.events'
import type {
  MobileResponse,
  Session,
  WalletContext,
} from './session/types'

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
  async getTools(): Promise<ToolSet> {
    return this.tools
  }
  async onModuleInit() {}
  async onModuleDestroy() {}
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

async function collect(
  gen: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
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

async function drain(
  gen: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
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
  let mcp: StubMCPClientService

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
      ],
    }).compile()

    chatService = moduleRef.get(ChatService)
    sessionService = moduleRef.get(SessionService)
    mcp = moduleRef.get(MCPClientService) as unknown as StubMCPClientService

    // Replace the real `streamText` with the scripted runner that
    // individual tests configure via `chatService.setModelRunner`. Also
    // stub out `getModel()` so it never reaches for a real API key.
    ;(chatService as unknown as { getModel: () => LanguageModel }).getModel = () =>
      ({} as LanguageModel)
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
      makeScriptedRunner([
        { text: 'Hello! How can I help you?' },
      ]),
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

  it('executes a server tool without emitting tool_pending', async () => {
    const rawResult = { products: [{ id: 'p1', name: 'Gift card' }] }
    mcp.tools = {
      get_products: {
        description: 'List TakumiPay products',
        inputSchema: {
          jsonSchema: { type: 'object', properties: {} },
          validate: () => ({ success: true, value: {} }),
        },
        execute: async () => rawResult,
      } as unknown as ToolSet[string],
    }

    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-server-1',
              toolName: 'get_products',
              input: {},
            },
          ],
        },
        { text: 'Here are the products.' },
      ]),
    )

    const session = seedSession('list products')
    const events = await collect(chatService.agentLoop(session))

    expect(events.some((e) => e.event === 'tool_pending')).toBe(false)

    const executed = events.find((e) => e.event === 'tool_executed')
    expect(executed).toBeDefined()
    if (executed?.event === 'tool_executed') {
      expect(executed.data.tool_call_id).toBe('tc-server-1')
      expect(executed.data.name).toBe('get_products')
    }

    const done = events.find((e) => e.event === 'done')
    expect(done).toBeDefined()
  })

  it('emits tool_pending for a mobile tool and resumes after tool_result', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-mobile-1',
              toolName: 'send_native_token',
              input: { to: '0xdeadbeef00000000000000000000000000000000', amount: '0.5', chain_name: 'Polygon' },
            },
          ],
        },
        { text: 'Sent.' },
      ]),
    )

    const session = seedSession('send 0.5 MATIC')
    const gen = chatService.agentLoop(session)

    const firstEvents = await collectUntil(gen, (e) => e.event === 'tool_pending')
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
    const toolMsg = session.messages
      .filter((m) => m.role === 'tool')
      .at(-1)
    expect(toolMsg).toBeDefined()
    const content = (toolMsg as { content: Array<{ output: { value: unknown } }> }).content[0]
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
              input: { to: '0xdeadbeef00000000000000000000000000000000', amount: '1', chain_name: 'Polygon' },
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
      .at(-1) as { content: Array<{ output: { value: AgentToolResult } }> }
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
              input: { to: '0xdeadbeef00000000000000000000000000000000', amount: '1', chain_name: 'Polygon' },
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
      .at(-1) as { content: Array<{ output: { value: AgentToolResult } }> }
    expect(toolMsg.content[0].output.value).toEqual({
      status: 'rejected',
      reason: 'user_declined',
    })
  })

  it('yields tool_timeout error and exits cleanly when mobile never responds', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        {
          toolCalls: [
            {
              toolCallId: 'tc-timeout',
              toolName: 'send_native_token',
              input: { to: '0xdeadbeef00000000000000000000000000000000', amount: '1', chain_name: 'Polygon' },
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
              input: { to: '0xdeadbeef00000000000000000000000000000000', amount: '0.1', chain_name: 'Polygon' },
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
