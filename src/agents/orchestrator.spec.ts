/**
 * Orchestrator integration tests.
 *
 * Spec: docs/multi-agent-architecture-spec.md §6, §9, §11.2.
 * Task: docs/multi-agent-architecture-task/13_orchestrator_routing_and_tasks.
 *       Also covers a meaningful subset of Task 19's coverage targets.
 *
 * Strategy:
 *  - Real registry (loaded via card register helpers).
 *  - Real in-memory `TaskStore`.
 *  - Mocked LLM (`MockCoreRunner` yields canned text + tool calls).
 *  - Mocked `SseSink` (records every frame; resolves
 *    `awaitMobileResult` via a queue).
 */

import type { LanguageModel } from 'ai'

import { coreCard } from './core/card'
import { defiCard } from './defi/card'
import { orchestrate, type SseFrame, type SseSink } from './orchestrator'
import { __resetRegistryForTests, registerAgent } from './registry'
import { createInMemoryTaskStore } from './tasks/store'
import type { WalletContext } from './types'
import { walletCard } from './wallet/card'

const wc: WalletContext = {
  address: '0x0000000000000000000000000000000000000001',
  namespace: 'eip155',
  chain_id: 8453,
}

const fakeModel = { __fake: true } as unknown as LanguageModel

function recordingSink(responses: Record<string, unknown> = {}): SseSink & {
  frames: SseFrame[]
} {
  const frames: SseFrame[] = []
  return {
    frames,
    emit(frame) {
      frames.push(frame)
    },
    awaitMobileResult(toolCallId) {
      if (!(toolCallId in responses)) {
        return Promise.reject(
          new Error(`test: no canned response for ${toolCallId}`),
        )
      }
      return Promise.resolve(responses[toolCallId])
    },
  }
}

interface MockTurn {
  text?: string
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    input: unknown
  }>
}

function mockRunner(turn: MockTurn) {
  return () => ({
    textStream: (async function* () {
      await Promise.resolve()
      if (turn.text) yield turn.text
    })(),
    toolCalls: Promise.resolve(turn.toolCalls ?? []),
  })
}

describe('orchestrator', () => {
  beforeEach(() => {
    __resetRegistryForTests()
    registerAgent(coreCard)
    registerAgent(walletCard)
    registerAgent(defiCard)
  })

  it('wallet tool round-trip emits tool_pending with wallet origin and forwards wallet_context', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink({
      tc_1: { status: 'success', tx_hash: '0xdead' },
    })
    await orchestrate({
      conversation_id: 'conv-1',
      user_message: 'send 1 USDC to 0xabc',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_1',
            toolName: 'transfer_erc20',
            input: { chain_id: 8453, to: '0xabc', token_amount: '1' },
          },
        ],
      }) as never,
    })

    const pending = sink.frames.find((f) => f.kind === 'tool_pending')
    expect(pending).toBeDefined()
    if (pending?.kind !== 'tool_pending') throw new Error()
    expect(pending.origin_agent_id).toBe('wallet')
    expect(pending.name).toBe('transfer_erc20')
    expect(pending.wallet_context.address).toBe(wc.address)
    expect(pending.wallet_context.chain_id).toBe(wc.chain_id)

    const completed = sink.frames.find((f) => f.kind === 'tool_result')
    expect(completed).toBeDefined()

    const tasks = await store.listTasksForConversation('conv-1')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].owner_agent).toBe('wallet')
    expect(tasks[0].status).toBe('completed')
  })

  it('defi tool round-trip routes via defi handler and surfaces stubbed sentinel as output', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink({
      tc_defi: {
        status: 'stubbed',
        message: 'DeFi agent is not yet wired up.',
      },
    })
    await orchestrate({
      conversation_id: 'conv-2',
      user_message: 'deposit 50 USDC into Aave',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_defi',
            toolName: 'defi_deposit',
            input: {
              protocol_slug: 'aave-v3-base',
              chain_id: 8453,
              asset_symbol: 'USDC',
              amount_raw: '50000000',
            },
          },
        ],
      }) as never,
    })

    const pending = sink.frames.find((f) => f.kind === 'tool_pending')
    expect(pending?.kind).toBe('tool_pending')
    if (pending?.kind !== 'tool_pending') throw new Error()
    expect(pending.origin_agent_id).toBe('defi')

    const tasks = await store.listTasksForConversation('conv-2')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].owner_agent).toBe('defi')
    expect(tasks[0].status).toBe('completed')
  })

  it('core_clarify short-circuits as an assistant message (no tool_pending to mobile)', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink()
    await orchestrate({
      conversation_id: 'conv-3',
      user_message: 'do the thing',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_clarify',
            toolName: 'core_clarify',
            input: { question: 'Which token and amount?' },
          },
        ],
      }) as never,
    })

    expect(sink.frames.find((f) => f.kind === 'tool_pending')).toBeUndefined()
    const msg = sink.frames.find((f) => f.kind === 'assistant_message')
    expect(msg).toBeDefined()
    if (msg?.kind !== 'assistant_message') throw new Error()
    expect(msg.text).toContain('Which token')

    const tasks = await store.listTasksForConversation('conv-3')
    expect(tasks).toHaveLength(0)
  })

  it('core_handoff conversational=true emits narrative_handoff markers around the specialist', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink()
    await orchestrate({
      conversation_id: 'conv-4',
      user_message: 'explain liquid staking risks',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_handoff',
            toolName: 'core_handoff',
            input: {
              to: 'defi',
              brief: 'explain risks',
              conversational: true,
            },
          },
        ],
      }) as never,
    })

    const kinds = sink.frames.map((f) => f.kind)
    expect(kinds).toContain('narrative_handoff')
    expect(kinds).toContain('narrative_handoff_end')
  })

  it('unknown tool surfaces friendly copy and never opens an AgentTask', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink()
    await orchestrate({
      conversation_id: 'conv-5',
      user_message: 'do mystery thing',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_unknown',
            toolName: 'mystery_tool',
            input: {},
          },
        ],
      }) as never,
    })

    const msg = sink.frames.find((f) => f.kind === 'assistant_message')
    expect(msg?.kind).toBe('assistant_message')
    const tasks = await store.listTasksForConversation('conv-5')
    expect(tasks).toHaveLength(0)
  })

  it('wallet handler receives wallet_context with the same address/chain as the orchestrator entry', async () => {
    // Spec §9: wallet_context flows verbatim — same address + chain_id
    // arrive on the tool_pending envelope as on entry.
    const store = createInMemoryTaskStore()
    const sink = recordingSink({
      tc_wc: { status: 'success' },
    })
    const entryWc: WalletContext = {
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      namespace: 'eip155',
      chain_id: 137,
    }
    await orchestrate({
      conversation_id: 'conv-wc',
      user_message: 'pay 1 USDC',
      wallet_context: entryWc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_wc',
            toolName: 'transfer_erc20',
            input: { chain_id: 137 },
          },
        ],
      }) as never,
    })
    const pending = sink.frames.find((f) => f.kind === 'tool_pending')
    if (pending?.kind !== 'tool_pending') throw new Error()
    expect(pending.wallet_context.address).toBe(entryWc.address)
    expect(pending.wallet_context.chain_id).toBe(entryWc.chain_id)
    expect(pending.wallet_context.namespace).toBe(entryWc.namespace)
  })

  it('multiple tool calls in one turn produce one AgentTask each, in order', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink({
      tc_a: { status: 'success' },
      tc_b: { status: 'success' },
    })
    await orchestrate({
      conversation_id: 'conv-multi',
      user_message: 'send a, send b',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({
        toolCalls: [
          {
            toolCallId: 'tc_a',
            toolName: 'transfer_erc20',
            input: { chain_id: 8453 },
          },
          {
            toolCallId: 'tc_b',
            toolName: 'transfer_erc20',
            input: { chain_id: 8453 },
          },
        ],
      }) as never,
    })
    const tasks = await store.listTasksForConversation('conv-multi')
    expect(tasks).toHaveLength(2)
    expect(tasks.every((t) => t.status === 'completed')).toBe(true)
  })

  it('forwards text deltas with origin_agent_id "core"', async () => {
    const store = createInMemoryTaskStore()
    const sink = recordingSink()
    await orchestrate({
      conversation_id: 'conv-6',
      user_message: 'hi',
      wallet_context: wc,
      model: fakeModel,
      store,
      sse_sink: sink,
      core_runner: mockRunner({ text: 'Hi there!' }) as never,
    })

    const deltas = sink.frames.filter((f) => f.kind === 'text_delta')
    expect(deltas).toHaveLength(1)
    if (deltas[0].kind !== 'text_delta') throw new Error()
    expect(deltas[0].origin_agent_id).toBe('core')
    expect(deltas[0].delta).toBe('Hi there!')
  })
})
