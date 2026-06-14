import {
  __setSnapshotForTests,
  composeUrl,
  enabledResourceIds,
  enabledResources,
  getResource,
  refreshCatalog,
  resolveResourceRequest,
  type X402ResourceRow,
} from './catalog'

const SECURITY_AUDIT: X402ResourceRow = {
  id: 'security-audit',
  label: 'security audit',
  url: 'https://seller.example/api/v1/audit',
  method: 'GET',
  purpose: 'audit status, admin keys, exploit history',
  useWhen: ['is it audited?'],
  expectedMaxUsdc: 0.5,
  enabled: true,
  priority: 100,
}

const PRICE_FEED: X402ResourceRow = {
  id: 'premium-price-feed',
  label: 'premium price feed',
  url: 'https://oracle.example/price',
  method: 'GET',
  purpose: 'sub-second institutional prices',
  useWhen: ['what is the live price?'],
  enabled: true,
  priority: 50,
}

describe('x402 catalog', () => {
  afterEach(() => {
    // Reset to an empty catalog so tests don't bleed into each other.
    __setSnapshotForTests([])
  })

  describe('reads (CI-3 presence/enabled = exposed)', () => {
    it('enabledResourceIds excludes disabled and url-less rows', () => {
      __setSnapshotForTests([
        SECURITY_AUDIT,
        { ...PRICE_FEED, id: 'disabled', enabled: false },
        { ...PRICE_FEED, id: 'no-url', url: '' },
      ])
      expect(enabledResourceIds()).toEqual(['security-audit'])
    })

    it('orders enabled resources by priority (ascending)', () => {
      __setSnapshotForTests([SECURITY_AUDIT, PRICE_FEED])
      expect(enabledResourceIds()).toEqual([
        'premium-price-feed', // priority 50
        'security-audit', // priority 100
      ])
    })

    it('getResource resolves an enabled id and returns undefined for unknown', () => {
      __setSnapshotForTests([SECURITY_AUDIT])
      expect(getResource('security-audit')?.url).toBe(SECURITY_AUDIT.url)
      expect(getResource('nope')).toBeUndefined()
      expect(getResource('')).toBeUndefined()
    })
  })

  describe('composeUrl (CI-2 server-resolved URL)', () => {
    it('returns the base verbatim when no path/query (back-compatible)', () => {
      expect(composeUrl('https://x.example/api')).toBe('https://x.example/api')
    })
    it('appends a query string', () => {
      expect(
        composeUrl('https://x.example/api', undefined, { protocol: 'aave-v3' }),
      ).toBe('https://x.example/api?protocol=aave-v3')
    })
    it('joins a path then appends the query', () => {
      expect(composeUrl('https://x.example/api', 'sub', { a: 'b' })).toBe(
        'https://x.example/api/sub?a=b',
      )
    })
    it('merges into a query already present on the base', () => {
      expect(
        composeUrl('https://x.example/api?k=1', undefined, { a: 'b' }),
      ).toBe('https://x.example/api?k=1&a=b')
    })
  })

  describe('resolveResourceRequest (kills the pin hack — CI-2/CI-4/CI-5)', () => {
    it('resolves a known capability to { url, method, maxSpendUsdc }', () => {
      __setSnapshotForTests([SECURITY_AUDIT])
      const r = resolveResourceRequest('security-audit')
      expect(r).toEqual({
        url: SECURITY_AUDIT.url,
        method: 'GET',
        maxSpendUsdc: 0.5, // from expectedMaxUsdc (CI-4)
      })
    })

    it('shapes the request from params via buildRequest', () => {
      __setSnapshotForTests([SECURITY_AUDIT])
      const r = resolveResourceRequest('security-audit', {
        protocol: 'aave-v3',
      })
      expect(r?.url).toBe(`${SECURITY_AUDIT.url}?protocol=aave-v3`)
    })

    it('lets an explicit maxSpendUsdc override the resource default (only narrows)', () => {
      __setSnapshotForTests([SECURITY_AUDIT])
      expect(
        resolveResourceRequest('security-audit', {}, 0.1)?.maxSpendUsdc,
      ).toBe(0.1)
    })

    it('returns undefined for an unknown/disabled id (no throw, no raw echo)', () => {
      __setSnapshotForTests([SECURITY_AUDIT])
      expect(resolveResourceRequest('unknown')).toBeUndefined()
    })
  })

  describe('refreshCatalog (purely DB-driven, no env fallback)', () => {
    const ORIGINAL = process.env.X402_SECURITY_AUDIT_URL
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.X402_SECURITY_AUDIT_URL
      else process.env.X402_SECURITY_AUDIT_URL = ORIGINAL
    })

    it('replaces the snapshot from the loader', async () => {
      await refreshCatalog(async () => [PRICE_FEED])
      expect(enabledResourceIds()).toEqual(['premium-price-feed'])
    })

    it('an empty loader yields an empty catalog — env is NOT a fallback', async () => {
      // Even with the env var set, runtime never reads it (it only seeds the DB).
      process.env.X402_SECURITY_AUDIT_URL = 'https://demo.example/audit'
      __setSnapshotForTests([PRICE_FEED])
      await refreshCatalog(async () => [])
      expect(enabledResourceIds()).toEqual([])
    })

    it('keeps the current snapshot when the loader throws (no empty catalog)', async () => {
      __setSnapshotForTests([PRICE_FEED])
      await refreshCatalog(() => Promise.reject(new Error('db down')))
      expect(enabledResourceIds()).toEqual(['premium-price-feed'])
    })
  })

  describe('extensibility headline (G1)', () => {
    it('adding a second resource needs only data — reads/resolution just work', () => {
      __setSnapshotForTests([SECURITY_AUDIT, PRICE_FEED])
      expect(enabledResources()).toHaveLength(2)
      expect(resolveResourceRequest('premium-price-feed')?.url).toBe(
        PRICE_FEED.url,
      )
      expect(resolveResourceRequest('security-audit')?.url).toBe(
        SECURITY_AUDIT.url,
      )
    })
  })
})
