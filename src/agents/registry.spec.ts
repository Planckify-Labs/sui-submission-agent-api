import { coreCard } from './core/card'
import { defiCard } from './defi/card'
import {
  __resetRegistryForTests,
  assertRegistryInvariants,
  getAgentCard,
  getAgentForTool,
  listAgents,
  registerAgent,
} from './registry'
import type { AgentCard } from './types'
import { walletCard } from './wallet/card'

function buildDummyCard(overrides: Partial<AgentCard>): AgentCard {
  return {
    id: 'dummy',
    version: '0.0.0',
    display_name: 'Dummy',
    description: 'fixture',
    tool_prefixes: ['dummy_'],
    capabilities: [],
    requires_wallet_context: false,
    requires_jwt: false,
    default_system_prompt_ref: 'dummy.v0',
    status: 'ready',
    ...overrides,
  }
}

describe('agents/registry', () => {
  beforeEach(() => {
    __resetRegistryForTests()
  })

  describe('happy path', () => {
    beforeEach(() => {
      registerAgent(coreCard)
      registerAgent(walletCard)
      registerAgent(defiCard)
    })

    it('lists agents in insertion order — Core → Wallet → DeFi', () => {
      expect(listAgents().map((c) => c.id)).toEqual(['core', 'wallet', 'defi'])
    })

    it('looks up cards by id', () => {
      expect(getAgentCard('core')?.id).toBe('core')
      expect(getAgentCard('wallet')?.display_name).toBe('Wallet specialist')
      expect(getAgentCard('defi')?.status).toBe('stub')
    })

    it('routes core_ family to Core', () => {
      expect(getAgentForTool('core_clarify')?.id).toBe('core')
      expect(getAgentForTool('core_handoff')?.id).toBe('core')
    })

    it('routes a get_ family tool to Wallet', () => {
      expect(getAgentForTool('get_balance')?.id).toBe('wallet')
      expect(getAgentForTool('get_wallet_sol_balance')?.id).toBe('wallet')
    })

    it('routes exact-name entries (e.g. read_contract) to Wallet', () => {
      expect(getAgentForTool('read_contract')?.id).toBe('wallet')
      expect(getAgentForTool('estimate_gas')?.id).toBe('wallet')
      expect(getAgentForTool('write_contract')?.id).toBe('wallet')
    })

    it('routes defi_ family to DeFi', () => {
      expect(getAgentForTool('defi_deposit')?.id).toBe('defi')
      expect(getAgentForTool('defi_list_opportunities')?.id).toBe('defi')
    })

    it('returns undefined for unknown tool', () => {
      expect(getAgentForTool('does_not_exist')).toBeUndefined()
    })

    it('exact-name entries win over hypothetical family prefix', () => {
      __resetRegistryForTests()
      registerAgent(
        buildDummyCard({ id: 'a', tool_prefixes: ['read_contract'] }),
      )
      registerAgent(buildDummyCard({ id: 'b', tool_prefixes: ['read_'] }))
      expect(getAgentForTool('read_contract')?.id).toBe('a')
      expect(getAgentForTool('read_storage')?.id).toBe('b')
    })

    it('passes invariant check against a faithful server tool list', () => {
      // Every prefix in the manifest must match at least one tool.
      // Tool names mirror the real `TOOL_REGISTRY` shape — the
      // points / address-book tools all start with `get_` or
      // `search_`, not `points_` / `address_book_`.
      expect(() =>
        assertRegistryInvariants([
          'core_clarify',
          'core_handoff',
          'get_balance',
          'get_points_balance',
          'get_address_book',
          'read_contract',
          'estimate_gas',
          'send_native_token',
          'transfer_erc20',
          'write_contract',
          'approve_erc20',
          'search_address_book',
          'deposit_points',
          'execute_redemption',
          'request_authentication',
          'defi_deposit',
          'defi_list_opportunities',
        ]),
      ).not.toThrow()
    })
  })

  describe('invariant violations', () => {
    it('rejects duplicate agent id', () => {
      registerAgent(buildDummyCard({ id: 'x', tool_prefixes: ['x_'] }))
      expect(() =>
        registerAgent(buildDummyCard({ id: 'x', tool_prefixes: ['y_'] })),
      ).toThrow(/duplicate agent id/)
    })

    it('rejects shared tool_prefix on registration', () => {
      registerAgent(buildDummyCard({ id: 'a', tool_prefixes: ['shared_'] }))
      expect(() =>
        registerAgent(buildDummyCard({ id: 'b', tool_prefixes: ['shared_'] })),
      ).toThrow(/tool_prefix "shared_" already owned/)
    })

    it('rejects Core declaring a non-core_ prefix (§4.1)', () => {
      registerAgent(
        buildDummyCard({ id: 'core', tool_prefixes: ['core_', 'get_'] }),
      )
      expect(() => assertRegistryInvariants(['get_balance'])).toThrow(
        /Core declares prefixes.*must be exactly \["core_"\]/,
      )
    })

    it('warns (does not throw) on dead prefix — mobile-only tools may exist', () => {
      registerAgent(
        buildDummyCard({ id: 'ghost', tool_prefixes: ['ghost_'] }),
      )
      const warns: string[] = []
      const orig = console.warn
      // eslint-disable-next-line no-console
      console.warn = (msg: unknown) => warns.push(String(msg))
      try {
        // No throw — invariant 2 is now a soft check.
        expect(() => assertRegistryInvariants([])).not.toThrow()
        expect(warns.some((w) => w.includes('dead prefix "ghost_"'))).toBe(true)
      } finally {
        console.warn = orig
      }
    })

    it('rejects orphan tool — no prefix claims it', () => {
      registerAgent(
        buildDummyCard({ id: 'partial', tool_prefixes: ['partial_'] }),
      )
      expect(() =>
        assertRegistryInvariants(['partial_a', 'unowned_tool']),
      ).toThrow(/orphan tool "unowned_tool"/)
    })
  })
})
