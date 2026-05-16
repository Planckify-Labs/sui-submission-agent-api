import {
  createInMemoryTaskStore,
  type TaskStore,
} from './store'

describe('createInMemoryTaskStore (TaskStore contract)', () => {
  let store: TaskStore

  beforeEach(() => {
    store = createInMemoryTaskStore()
  })

  it('createTask returns a pending task with a generated id', async () => {
    const task = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'wallet',
      brief: 'Run transfer_erc20',
      input: { tool_name: 'transfer_erc20' },
    })
    expect(task.id).toMatch(/[0-9a-f-]{8,}/i)
    expect(task.status).toBe('pending')
    expect(task.owner_agent).toBe('wallet')
    expect(task.conversation_id).toBe('conv-1')
  })

  it('transitions pending → working → completed', async () => {
    const t = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'wallet',
      brief: 'b',
      input: null,
    })
    const w = await store.transitionTask(t.id, 'working')
    expect(w.status).toBe('working')
    const c = await store.transitionTask(t.id, 'completed', { tx_hash: '0xdead' })
    expect(c.status).toBe('completed')
    expect(c.output).toEqual({ tx_hash: '0xdead' })
  })

  it('rejects illegal transitions (pending → completed)', async () => {
    const t = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'wallet',
      brief: 'b',
      input: null,
    })
    await expect(store.transitionTask(t.id, 'completed')).rejects.toThrow(
      /illegal transition/,
    )
  })

  it('rejects further transitions on a completed task', async () => {
    const t = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'wallet',
      brief: 'b',
      input: null,
    })
    await store.transitionTask(t.id, 'working')
    await store.transitionTask(t.id, 'completed')
    await expect(store.transitionTask(t.id, 'failed')).rejects.toThrow(
      /illegal transition/,
    )
  })

  it('appendPeerMessage round-trips through listTasksForConversation', async () => {
    const t = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'defi',
      brief: 'b',
      input: null,
    })
    await store.appendPeerMessage({
      task_id: t.id,
      message: {
        from: 'defi',
        to: 'core',
        kind: 'ask_user',
        body: 'Which tier?',
      },
    })
    const tasks = await store.listTasksForConversation('conv-1')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].peer_messages).toHaveLength(1)
    expect(tasks[0].peer_messages[0].body).toBe('Which tier?')
  })

  it('lists tasks ascending by created_at', async () => {
    const a = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'wallet',
      brief: 'a',
      input: null,
    })
    // simulate a 1ms gap so timestamps differ deterministically
    await new Promise((resolve) => setTimeout(resolve, 2))
    const b = await store.createTask({
      conversation_id: 'conv-1',
      owner_agent: 'defi',
      brief: 'b',
      input: null,
    })
    const tasks = await store.listTasksForConversation('conv-1')
    expect(tasks.map((t) => t.id)).toEqual([a.id, b.id])
  })
})
