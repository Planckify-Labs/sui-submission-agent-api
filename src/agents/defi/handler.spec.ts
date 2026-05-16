import type { AgentTask } from '../types'
import { handleDefiTask } from './handler'

const task: AgentTask = {
  id: 'task-1',
  conversation_id: 'conv-1',
  owner_agent: 'defi',
  brief: 'fixture',
  input: {},
  status: 'pending',
  created_at: new Date(),
  updated_at: new Date(),
}

describe('agents/defi/handler', () => {
  it('defi_list_opportunities → three canned rows', () => {
    const { output } = handleDefiTask({
      task,
      dispatch: { tool_name: 'defi_list_opportunities' },
    })
    const o = output as { opportunities: Array<{ risk_tier: string }> }
    expect(o.opportunities).toHaveLength(3)
    expect(o.opportunities.map((r) => r.risk_tier).sort()).toEqual([
      'aggressive',
      'balanced',
      'conservative',
    ])
  })

  it('defi_list_positions → empty array', () => {
    const { output } = handleDefiTask({
      task,
      dispatch: { tool_name: 'defi_list_positions' },
    })
    expect(output).toEqual({ positions: [] })
  })

  it.each(['defi_deposit', 'defi_withdraw', 'defi_rebalance'])(
    '%s → { status: "stubbed", message: ... }',
    (name) => {
      const { output } = handleDefiTask({
        task,
        dispatch: { tool_name: name },
      })
      expect(output).toMatchObject({
        status: 'stubbed',
        message: expect.stringContaining('DeFi'),
      })
    },
  )

  it('unknown defi_* tool falls back to stubbed sentinel', () => {
    const { output } = handleDefiTask({
      task,
      dispatch: { tool_name: 'defi_get_config' },
    })
    expect(output).toMatchObject({ status: 'stubbed' })
  })
})
