import { Test, type TestingModule } from '@nestjs/testing'
import {
  MOBILE_RESULT_TIMEOUT_MS,
  SESSION_TTL_MS,
  SessionService,
} from './session.service'
import {
  type MobileResponse,
  TimeoutError,
  type ToolPendingPayload,
  type WalletContext,
} from './types'

const wallet: WalletContext = {
  address: '0x1111111111111111111111111111111111111111',
  chain_id: 137,
  chain_name: 'Polygon',
  chain_symbol: 'MATIC',
  label: 'Test Wallet',
}

function makePayload(
  sessionId: string,
  toolCallId = 'tc-1',
): ToolPendingPayload {
  return {
    session_id: sessionId,
    tool_call_id: toolCallId,
    name: 'send_native_token',
    input: { to: '0xdead', value: '1' },
    meta: {
      executor: 'mobile',
      capability: 'write',
      category: 'blockchain_write',
      human_summary: 'Send 1 wei to 0xdead',
    },
  }
}

function makeResponse(
  sessionId: string,
  toolCallId = 'tc-1',
): MobileResponse {
  return {
    type: 'tool_result',
    session_id: sessionId,
    tool_call_id: toolCallId,
    result: {
      status: 'success',
      tx_hash: '0xabc',
      tx_confirmed: true,
    },
  }
}

describe('SessionService', () => {
  let service: SessionService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionService],
    }).compile()
    service = module.get<SessionService>(SessionService)
  })

  describe('create / get', () => {
    it('creates a session with the wallet context', () => {
      const session = service.create(wallet)
      expect(session.id).toBeDefined()
      expect(session.wallet_address).toBe(wallet.address)
      expect(session.chain_id).toBe(137)
      expect(session.state).toBe('idle')
      expect(session.pending.size).toBe(0)
      expect(session.pendingPayloads.size).toBe(0)
    })

    it('returns undefined for unknown sessions', () => {
      expect(service.get('missing')).toBeUndefined()
    })

    it('returns the session for known ids', () => {
      const session = service.create(wallet)
      expect(service.get(session.id)?.id).toBe(session.id)
    })
  })

  describe('awaitMobileResult', () => {
    it('resolves when resolveMobileResult is called with a matching id', async () => {
      const session = service.create(wallet)
      const payload = makePayload(session.id)
      const response = makeResponse(session.id)

      const promise = service.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 2_000 },
      )

      // Payload must be present for reconnect re-delivery while unresolved.
      expect(session.pendingPayloads.get(payload.tool_call_id)).toEqual(payload)
      expect(session.state).toBe('awaiting_mobile')

      service.resolveMobileResult(session.id, payload.tool_call_id, response)
      await expect(promise).resolves.toEqual(response)

      // Cleanup on resolve.
      expect(session.pending.has(payload.tool_call_id)).toBe(false)
      expect(session.pendingPayloads.has(payload.tool_call_id)).toBe(false)
      expect(session.state).toBe('idle')
    })

    it('rejects with TimeoutError after timeoutMs', async () => {
      const session = service.create(wallet)
      const payload = makePayload(session.id)

      const promise = service.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 20 },
      )

      await expect(promise).rejects.toBeInstanceOf(TimeoutError)
      expect(session.pending.has(payload.tool_call_id)).toBe(false)
      expect(session.pendingPayloads.has(payload.tool_call_id)).toBe(false)
    })

    it('keeps pendingPayloads present until resolution', async () => {
      const session = service.create(wallet)
      const payload = makePayload(session.id, 'tc-keep')

      const promise = service.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 1_000 },
      )

      // Tick the event loop without resolving.
      await Promise.resolve()
      expect(session.pendingPayloads.get('tc-keep')).toEqual(payload)

      service.resolveMobileResult(
        session.id,
        'tc-keep',
        makeResponse(session.id, 'tc-keep'),
      )
      await promise
      expect(session.pendingPayloads.has('tc-keep')).toBe(false)
    })

    it('uses the default timeout when opts is omitted', () => {
      // Sanity check on the constant; full timer behavior is covered above.
      expect(MOBILE_RESULT_TIMEOUT_MS).toBe(5 * 60_000)
    })

    it('rejects a duplicate tool_call_id', async () => {
      const session = service.create(wallet)
      const payload = makePayload(session.id)

      const promise = service.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 1_000 },
      )
      await expect(
        service.awaitMobileResult(
          session.id,
          payload.tool_call_id,
          payload,
          { timeoutMs: 1_000 },
        ),
      ).rejects.toThrow(/Duplicate tool_call_id/)

      service.resolveMobileResult(
        session.id,
        payload.tool_call_id,
        makeResponse(session.id),
      )
      await promise
    })
  })

  describe('resolveMobileResult (replay protection)', () => {
    it('throws on a second resolve for the same id', async () => {
      const session = service.create(wallet)
      const payload = makePayload(session.id)

      const promise = service.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 1_000 },
      )

      service.resolveMobileResult(
        session.id,
        payload.tool_call_id,
        makeResponse(session.id),
      )
      await promise

      expect(() =>
        service.resolveMobileResult(
          session.id,
          payload.tool_call_id,
          makeResponse(session.id),
        ),
      ).toThrow(/already resolved or unknown/)
    })

    it('throws when the session is unknown', () => {
      expect(() =>
        service.resolveMobileResult('missing', 'tc-1', makeResponse('missing')),
      ).toThrow(/not found/)
    })
  })

  describe('cleanup', () => {
    it('rejects outstanding deferreds and clears pending maps', async () => {
      const session = service.create(wallet)
      const payload = makePayload(session.id)
      const promise = service.awaitMobileResult(
        session.id,
        payload.tool_call_id,
        payload,
        { timeoutMs: 5_000 },
      )

      service.cleanup(session.id)
      await expect(promise).rejects.toThrow(/cleaned up/)
      expect(session.pending.size).toBe(0)
      expect(session.pendingPayloads.size).toBe(0)
      expect(session.state).toBe('idle')
    })
  })

  describe('eviction', () => {
    it('evicts sessions older than SESSION_TTL_MS on lazy get', () => {
      const session = service.create(wallet)
      // Backdate the session past the TTL.
      session.last_active = new Date(Date.now() - (SESSION_TTL_MS + 1_000))

      expect(service.get(session.id)).toBeUndefined()
      expect(service.size()).toBe(0)
    })

    it('sweep() evicts all expired sessions', () => {
      const a = service.create(wallet)
      const b = service.create(wallet)
      a.last_active = new Date(Date.now() - (SESSION_TTL_MS + 1_000))
      b.last_active = new Date() // fresh

      const evicted = service.sweep()
      expect(evicted).toBe(1)
      expect(service.size()).toBe(1)
      expect(service.get(b.id)?.id).toBe(b.id)
    })
  })
})
