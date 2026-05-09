import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { ExecutionContext } from '@nestjs/common'
import { ApiKeyGuard } from './api-key.guard'

const VALID_KEY = 'expected-key'

function makeConfigService(value: string | undefined): ConfigService {
  return {
    get: (key: string) => (key === 'CHAT_API_KEY' ? value : undefined),
  } as unknown as ConfigService
}

function makeContext(request: {
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
  query?: Record<string, unknown>
  method?: string
  url?: string
}): ExecutionContext {
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        url: '/chat',
        headers: {},
        ...request,
      }),
    }),
  } as unknown as ExecutionContext
  return ctx
}

describe('ApiKeyGuard', () => {
  describe('configuration', () => {
    it('throws UnauthorizedException when CHAT_API_KEY is not configured', () => {
      const guard = new ApiKeyGuard(makeConfigService(undefined))
      expect(() =>
        guard.canActivate(
          makeContext({ headers: { 'x-api-key': VALID_KEY } }),
        ),
      ).toThrow(UnauthorizedException)
      expect(() =>
        guard.canActivate(
          makeContext({ headers: { 'x-api-key': VALID_KEY } }),
        ),
      ).toThrow(/CHAT_API_KEY is not configured/)
    })
  })

  describe('extraction — header sources', () => {
    let guard: ApiKeyGuard

    beforeEach(() => {
      guard = new ApiKeyGuard(makeConfigService(VALID_KEY))
    })

    it('accepts the key via x-api-key header', () => {
      expect(
        guard.canActivate(
          makeContext({ headers: { 'x-api-key': VALID_KEY } }),
        ),
      ).toBe(true)
    })

    it('accepts the key via Authorization: Bearer <token>', () => {
      expect(
        guard.canActivate(
          makeContext({
            headers: { authorization: `Bearer ${VALID_KEY}` },
          }),
        ),
      ).toBe(true)
    })

    it('accepts a bare Authorization header without the Bearer prefix', () => {
      expect(
        guard.canActivate(
          makeContext({ headers: { authorization: VALID_KEY } }),
        ),
      ).toBe(true)
    })

    it('treats Bearer prefix case-insensitively', () => {
      expect(
        guard.canActivate(
          makeContext({
            headers: { authorization: `bearer ${VALID_KEY}` },
          }),
        ),
      ).toBe(true)
      expect(
        guard.canActivate(
          makeContext({
            headers: { authorization: `BEARER ${VALID_KEY}` },
          }),
        ),
      ).toBe(true)
    })

    it('uses the first value when x-api-key is sent as an array', () => {
      expect(
        guard.canActivate(
          makeContext({ headers: { 'x-api-key': [VALID_KEY, 'other'] } }),
        ),
      ).toBe(true)
    })

    it('prefers x-api-key over Authorization when both are set', () => {
      expect(
        guard.canActivate(
          makeContext({
            headers: {
              'x-api-key': VALID_KEY,
              authorization: 'Bearer wrong',
            },
          }),
        ),
      ).toBe(true)
    })
  })

  describe('extraction — body / query sources', () => {
    let guard: ApiKeyGuard

    beforeEach(() => {
      guard = new ApiKeyGuard(makeConfigService(VALID_KEY))
    })

    it('accepts secrectApiKey from the query string (legacy spelling)', () => {
      expect(
        guard.canActivate(
          makeContext({ query: { secrectApiKey: VALID_KEY } }),
        ),
      ).toBe(true)
    })

    it('accepts secretApiKey from the query string (correct spelling)', () => {
      expect(
        guard.canActivate(
          makeContext({ query: { secretApiKey: VALID_KEY } }),
        ),
      ).toBe(true)
    })

    it('accepts apiKey or api_key from the body', () => {
      expect(
        guard.canActivate(makeContext({ body: { apiKey: VALID_KEY } })),
      ).toBe(true)
      expect(
        guard.canActivate(makeContext({ body: { api_key: VALID_KEY } })),
      ).toBe(true)
    })

    it('falls through fields in priority order: secrectApiKey > secretApiKey > apiKey > api_key', () => {
      // Only the highest-priority field is read; the others are ignored.
      expect(
        guard.canActivate(
          makeContext({
            body: {
              secrectApiKey: VALID_KEY,
              secretApiKey: 'wrong',
              apiKey: 'wrong',
              api_key: 'wrong',
            },
          }),
        ),
      ).toBe(true)
    })

    it('ignores non-string credential fields in the body / query', () => {
      expect(() =>
        guard.canActivate(
          makeContext({ body: { apiKey: 12345 as unknown as string } }),
        ),
      ).toThrow(UnauthorizedException)
    })
  })

  describe('failure modes', () => {
    let guard: ApiKeyGuard

    beforeEach(() => {
      guard = new ApiKeyGuard(makeConfigService(VALID_KEY))
    })

    it('rejects a missing key', () => {
      expect(() => guard.canActivate(makeContext({}))).toThrow(
        UnauthorizedException,
      )
      expect(() => guard.canActivate(makeContext({}))).toThrow(/api key needed/i)
    })

    it('rejects an invalid key', () => {
      expect(() =>
        guard.canActivate(
          makeContext({ headers: { 'x-api-key': 'wrong' } }),
        ),
      ).toThrow(UnauthorizedException)
      expect(() =>
        guard.canActivate(
          makeContext({ headers: { 'x-api-key': 'wrong' } }),
        ),
      ).toThrow(/Invalid API key/i)
    })

    it('treats a non-object body as no credential present', () => {
      expect(() =>
        guard.canActivate(
          makeContext({ body: 'a-raw-string' as unknown as object }),
        ),
      ).toThrow(UnauthorizedException)
    })
  })
})
