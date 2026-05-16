import { coreCard } from '../core/card'
import { defiCard } from '../defi/card'
import { __resetRegistryForTests, registerAgent } from '../registry'
import type { AgentTask, WalletContext } from '../types'
import { walletCard } from './card'
import { handleWalletTask, type WalletDispatchInput } from './handler'

const baseTask: AgentTask = {
  id: 'task-1',
  conversation_id: 'conv-1',
  owner_agent: 'wallet',
  brief: 'fixture',
  input: {},
  status: 'pending',
  created_at: new Date(),
  updated_at: new Date(),
}

const wc: WalletContext = {
  address: '0x0000000000000000000000000000000000000000',
  namespace: 'eip155',
  chain_id: 8453,
}

function dispatch(overrides: Partial<WalletDispatchInput>): WalletDispatchInput {
  return {
    tool_name: 'transfer_erc20',
    input: {},
    tool_call_id: 'tc_1',
    ...overrides,
  }
}

describe('agents/wallet/handler', () => {
  beforeEach(() => {
    __resetRegistryForTests()
    registerAgent(coreCard)
    registerAgent(walletCard)
    registerAgent(defiCard)
  })

  it('emits a tool_pending envelope with origin_agent_id and forwarded wallet_context', () => {
    const result = handleWalletTask({
      task: baseTask,
      wallet_context: wc,
      dispatch: dispatch({
        tool_name: 'transfer_erc20',
        input: { chain_id: 8453, to: '0xabc', amount_wei: '100' },
      }),
    })
    expect(result.kind).toBe('tool_pending')
    if (result.kind !== 'tool_pending') return
    expect(result.envelope.origin_agent_id).toBe('wallet')
    expect(result.envelope.name).toBe('transfer_erc20')
    expect(result.envelope.wallet_context).toEqual(wc)
    expect(result.envelope.tool_call_id).toBe('tc_1')
  })

  it('refuses out-of-prefix tool (e.g. defi_deposit)', () => {
    const result = handleWalletTask({
      task: baseTask,
      wallet_context: wc,
      dispatch: dispatch({ tool_name: 'defi_deposit' }),
    })
    expect(result.kind).toBe('refused')
    if (result.kind !== 'refused') return
    expect(result.reason).toBe('out_of_prefix')
  })

  it('refuses unknown tool not in TOOL_REGISTRY', () => {
    const result = handleWalletTask({
      task: baseTask,
      wallet_context: wc,
      dispatch: dispatch({ tool_name: 'get_does_not_exist' }),
    })
    expect(result.kind).toBe('refused')
    if (result.kind !== 'refused') return
    expect(result.reason).toBe('unknown_tool')
  })

  it('forwards wallet_context verbatim — never mutates the input object', () => {
    const original: WalletContext = { ...wc }
    const result = handleWalletTask({
      task: baseTask,
      wallet_context: wc,
      dispatch: dispatch({}),
    })
    expect(wc).toEqual(original)
    if (result.kind === 'tool_pending') {
      expect(result.envelope.wallet_context).toBe(wc)
    }
  })
})
