import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { MCPClientService } from './mcp-client.service'
import { SessionService } from './session/session.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import type {
  ToolPendingPayload,
  WalletContext,
} from './session/types'

const TEST_API_KEY = 'test-api-key'

const wallet: WalletContext = {
  address: '0x1111111111111111111111111111111111111111',
  chain_id: 137,
  chain_name: 'Polygon',
  chain_symbol: 'MATIC',
}

function makePayload(
  sessionId: string,
  toolCallId: string,
): ToolPendingPayload {
  return {
    session_id: sessionId,
    tool_call_id: toolCallId,
    name: 'send_native_token',
    input: { to: '0xdeadbeef', value: '1' },
    meta: {
      executor: 'mobile',
      capability: 'write',
      category: 'blockchain_write',
      human_summary: `Send 1 wei to 0xdeadbeef (${toolCallId})`,
    },
  }
}

// A stub MCPClientService that does NOT spawn a subprocess. Only the bits
// ChatService touches (`getTools`) are implemented.
class StubMCPClientService {
  async getTools() {
    return {}
  }
  async onModuleInit() {}
  async onModuleDestroy() {}
}

describe('ChatController', () => {
  let app: NestFastifyApplication
  let sessionService: SessionService
  let chatService: ChatService

  beforeEach(async () => {
    const configValues: Record<string, string> = {
      CHAT_API_KEY: TEST_API_KEY,
      // No KIMI_K2_API_KEY — the streamChatResponse path is not exercised
      // in these tests.
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        ChatService,
        SessionService,
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              configValues[key] ?? fallback,
          },
        },
        { provide: MCPClientService, useClass: StubMCPClientService },
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    sessionService = moduleRef.get(SessionService)
    chatService = moduleRef.get(ChatService)
  })

  afterEach(async () => {
    await app.close()
  })

  async function httpPost(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method: 'POST',
      url,
      payload: body,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    })
  }

  describe('ApiKeyGuard', () => {
    it('rejects POST /chat/respond without an API key', async () => {
      const res = await httpPost('/chat/respond', {})
      expect(res.statusCode).toBe(401)
    })

    it('rejects POST /chat without an API key', async () => {
      const res = await httpPost('/chat', { messages: [] })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /chat/respond', () => {
    it('400 on malformed body', async () => {
      const res = await httpPost(
        '/chat/respond',
        { type: 'nonsense' },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(res.statusCode).toBe(400)
    })

    it('404 when session_id is unknown', async () => {
      const res = await httpPost(
        '/chat/respond',
        {
          type: 'tool_result',
          session_id: 'does-not-exist',
          tool_call_id: 'tc-1',
          result: { status: 'success' },
        },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(res.statusCode).toBe(404)
      const body = res.json() as Record<string, any>
      const code =
        body.code ??
        (typeof body.message === 'object' ? body.message?.code : undefined)
      expect(code).toBe('session_expired')
    })

    it('accepts tool_result and resolves the pending deferred (204)', async () => {
      const session = sessionService.create(wallet)
      const payload = makePayload(session.id, 'tc-ok')

      const resultPromise = sessionService.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 5_000 },
      )

      const res = await httpPost(
        '/chat/respond',
        {
          type: 'tool_result',
          session_id: session.id,
          tool_call_id: payload.tool_call_id,
          result: {
            status: 'success',
            tx_hash: '0xabc',
            tx_confirmed: true,
          },
        },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(res.statusCode).toBe(204)

      const resolved = await resultPromise
      expect(resolved).toMatchObject({
        type: 'tool_result',
        tool_call_id: 'tc-ok',
        result: { status: 'success', tx_hash: '0xabc' },
      })
    })

    it('accepts tool_rejected (204)', async () => {
      const session = sessionService.create(wallet)
      const payload = makePayload(session.id, 'tc-reject')

      const resultPromise = sessionService.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 5_000 },
      )

      const res = await httpPost(
        '/chat/respond',
        {
          type: 'tool_rejected',
          session_id: session.id,
          tool_call_id: payload.tool_call_id,
          reason: 'user_declined',
        },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(res.statusCode).toBe(204)

      await expect(resultPromise).resolves.toMatchObject({
        type: 'tool_rejected',
        reason: 'user_declined',
      })
    })

    it('409 when tool_call_id is unknown in a valid session', async () => {
      const session = sessionService.create(wallet)

      const res = await httpPost(
        '/chat/respond',
        {
          type: 'tool_result',
          session_id: session.id,
          tool_call_id: 'never-pending',
          result: { status: 'success' },
        },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(res.statusCode).toBe(409)
    })

    it('409 on replay (already-resolved tool_call_id)', async () => {
      const session = sessionService.create(wallet)
      const payload = makePayload(session.id, 'tc-replay')

      const pending = sessionService.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 5_000 },
      )

      // First response succeeds.
      const firstRes = await httpPost(
        '/chat/respond',
        {
          type: 'tool_result',
          session_id: session.id,
          tool_call_id: payload.tool_call_id,
          result: { status: 'success' },
        },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(firstRes.statusCode).toBe(204)
      await pending

      // Replay should be rejected with 409.
      const replayRes = await httpPost(
        '/chat/respond',
        {
          type: 'tool_result',
          session_id: session.id,
          tool_call_id: payload.tool_call_id,
          result: { status: 'success' },
        },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(replayRes.statusCode).toBe(409)
    })
  })

  describe('POST /chat reconnect branch', () => {
    it('emits a session_expired error event when session is unknown', async () => {
      // Call the service directly — we want to assert the SSE body contents
      // without going through HTTP framing (which varies per adapter).
      const response = chatService.buildReconnectResponse('missing-session')
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      )
      const body = await response.text()
      expect(body).toContain('event: error')
      expect(body).toContain('"code":"session_expired"')
      expect(body).toContain('"retryable":false')
    })

    it('re-emits all unresolved tool_pending payloads for awaiting_mobile sessions', async () => {
      const session = sessionService.create(wallet)
      const payloadA = makePayload(session.id, 'tc-a')
      const payloadB = makePayload(session.id, 'tc-b')

      // Seed two pending tool calls on the session. We purposely don't
      // await these — they keep the session in `awaiting_mobile`.
      const pendingA = sessionService.awaitMobileResult(
        session.id,
        payloadA.tool_call_id,
        payloadA,
        { timeoutMs: 5_000 },
      )
      const pendingB = sessionService.awaitMobileResult(
        session.id,
        payloadB.tool_call_id,
        payloadB,
        { timeoutMs: 5_000 },
      )

      const response = chatService.buildReconnectResponse(session.id)
      const body = await response.text()

      // Both payloads should appear as tool_pending events.
      const toolPendingCount = (body.match(/event: tool_pending/g) ?? [])
        .length
      expect(toolPendingCount).toBe(2)
      expect(body).toContain('"tool_call_id":"tc-a"')
      expect(body).toContain('"tool_call_id":"tc-b"')

      // Clean up the outstanding deferreds so jest doesn't complain.
      sessionService.cleanup(session.id)
      await Promise.allSettled([pendingA, pendingB])
    })

    it('POST /chat with session_id + empty messages hits the reconnect branch', async () => {
      const session = sessionService.create(wallet)
      const payload = makePayload(session.id, 'tc-http')
      const pending = sessionService.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 5_000 },
      )

      const res = await httpPost(
        '/chat',
        { session_id: session.id, messages: [] },
        { 'x-api-key': TEST_API_KEY },
      )
      expect(res.statusCode).toBe(200)

      const body = res.payload
      expect(body).toContain('event: tool_pending')
      expect(body).toContain('"tool_call_id":"tc-http"')

      sessionService.cleanup(session.id)
      await Promise.allSettled([pending])
    })
  })
})
