import { coreCard } from '../core/card'
import { defiCard } from './card'
import { __resetRegistryForTests, registerAgent } from '../registry'
import type { AgentTask, WalletContext } from '../types'
import { walletCard } from '../wallet/card'
import { handleDefiTask } from './handler'

describe('agents/defi/handler', () => {
  beforeEach(() => {
    __resetRegistryForTests()
    registerAgent(coreCard)
    registerAgent(walletCard)
    registerAgent(defiCard)
  })

  it('returns tool_pending envelope for valid defi tool', () => {
    const output = handleDefiTask({
      task: {} as unknown as AgentTask,
      wallet_context: { address: '0x123' } as unknown as WalletContext,
      dispatch: { tool_name: 'defi_deposit', input: {}, tool_call_id: '123' },
    })
    expect(output).toEqual({
      kind: 'tool_pending',
      envelope: {
        origin_agent_id: 'defi',
        tool_call_id: '123',
        name: 'defi_deposit',
        input: {},
        wallet_context: { address: '0x123' },
      },
    })
  })

  it('refuses unknown tools', () => {
    const output = handleDefiTask({
      task: {} as unknown as AgentTask,
      wallet_context: { address: '0x123' } as unknown as WalletContext,
      dispatch: { tool_name: 'unknown_tool', input: {}, tool_call_id: '123' },
    })
    expect(output).toEqual({
      kind: 'refused',
      reason: 'out_of_prefix',
    })
  })
})