import {
  chatRequestSchema,
  mobileResponseSchema,
  progressRequestSchema,
  toolResultBodySchema,
  toolResultPayloadSchema,
  toolRejectedBodySchema,
  walletContextSchema,
} from './chat.schemas'

describe('walletContextSchema', () => {
  const base = {
    address: '0x1111111111111111111111111111111111111111',
    chain_id: 137,
    chain_name: 'Polygon',
    chain_symbol: 'MATIC',
  }

  it('accepts a minimal EVM wallet context', () => {
    const parsed = walletContextSchema.safeParse(base)
    expect(parsed.success).toBe(true)
  })

  it('accepts the optional namespace, label, and points_authenticated fields', () => {
    const parsed = walletContextSchema.safeParse({
      ...base,
      namespace: 'eip155',
      label: 'Main',
      points_authenticated: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts solana and sui as namespace values', () => {
    expect(
      walletContextSchema.safeParse({ ...base, namespace: 'solana' }).success,
    ).toBe(true)
    expect(
      walletContextSchema.safeParse({ ...base, namespace: 'sui' }).success,
    ).toBe(true)
  })

  it('rejects an unknown namespace', () => {
    const parsed = walletContextSchema.safeParse({
      ...base,
      namespace: 'btc',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects negative chain_id', () => {
    expect(
      walletContextSchema.safeParse({ ...base, chain_id: -1 }).success,
    ).toBe(false)
  })

  it('accepts chain_id 0 (used by non-EVM Solana/Sui clients)', () => {
    expect(
      walletContextSchema.safeParse({ ...base, chain_id: 0 }).success,
    ).toBe(true)
  })

  it('rejects empty address', () => {
    expect(
      walletContextSchema.safeParse({ ...base, address: '' }).success,
    ).toBe(false)
  })

  it('rejects empty chain_name and chain_symbol', () => {
    expect(
      walletContextSchema.safeParse({ ...base, chain_name: '' }).success,
    ).toBe(false)
    expect(
      walletContextSchema.safeParse({ ...base, chain_symbol: '' }).success,
    ).toBe(false)
  })

  it('rejects address longer than 128 chars', () => {
    expect(
      walletContextSchema.safeParse({ ...base, address: 'a'.repeat(129) })
        .success,
    ).toBe(false)
  })

  it('rejects non-integer chain_id', () => {
    expect(
      walletContextSchema.safeParse({ ...base, chain_id: 1.5 }).success,
    ).toBe(false)
  })
})

describe('chatRequestSchema', () => {
  it('defaults messages to an empty array when missing', () => {
    const parsed = chatRequestSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.messages).toEqual([])
    }
  })

  it('accepts a fresh-turn request with wallet_context and messages', () => {
    const parsed = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'hi' }],
      wallet_context: {
        address: '0xabc',
        chain_id: 1,
        chain_name: 'Ethereum',
        chain_symbol: 'ETH',
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a reconnect request with session_id and empty messages', () => {
    const parsed = chatRequestSchema.safeParse({
      session_id: 'session-1',
      messages: [],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-uuid conversation_id', () => {
    const parsed = chatRequestSchema.safeParse({
      conversation_id: 'not-a-uuid',
      messages: [],
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts a uuid conversation_id', () => {
    // A valid v4 UUID — third group starts with "4", fourth group with [89ab].
    const parsed = chatRequestSchema.safeParse({
      conversation_id: '11111111-2222-4333-8444-555555555555',
      messages: [],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects when wallet_context fails its inner validation', () => {
    const parsed = chatRequestSchema.safeParse({
      messages: [],
      wallet_context: {
        address: '0xabc',
        chain_id: -1,
        chain_name: 'X',
        chain_symbol: 'Y',
      },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('toolResultPayloadSchema', () => {
  it('accepts a success with tx_hash and tx_confirmed', () => {
    const parsed = toolResultPayloadSchema.safeParse({
      status: 'success',
      tx_hash: '0xabc123',
      tx_confirmed: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a failed status with an error string', () => {
    const parsed = toolResultPayloadSchema.safeParse({
      status: 'failed',
      error: 'nonce too low',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-hex tx_hash', () => {
    const parsed = toolResultPayloadSchema.safeParse({
      status: 'success',
      tx_hash: 'not-hex',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts arbitrary unknown data', () => {
    const parsed = toolResultPayloadSchema.safeParse({
      status: 'success',
      data: { nested: { thing: [1, 2, 3] } },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown status value', () => {
    const parsed = toolResultPayloadSchema.safeParse({ status: 'pending' })
    expect(parsed.success).toBe(false)
  })
})

describe('mobileResponseSchema', () => {
  it('accepts a tool_result body', () => {
    const parsed = mobileResponseSchema.safeParse({
      type: 'tool_result',
      session_id: 's',
      tool_call_id: 't',
      result: { status: 'success' },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a tool_rejected body with an arbitrary reason string', () => {
    const parsed = mobileResponseSchema.safeParse({
      type: 'tool_rejected',
      session_id: 's',
      tool_call_id: 't',
      reason: 'wallet_locked',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown type discriminator', () => {
    const parsed = mobileResponseSchema.safeParse({
      type: 'tool_thinking',
      session_id: 's',
      tool_call_id: 't',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a tool_rejected body with an empty reason', () => {
    const parsed = mobileResponseSchema.safeParse({
      type: 'tool_rejected',
      session_id: 's',
      tool_call_id: 't',
      reason: '',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a tool_result body with empty session_id or tool_call_id', () => {
    expect(
      mobileResponseSchema.safeParse({
        type: 'tool_result',
        session_id: '',
        tool_call_id: 't',
        result: { status: 'success' },
      }).success,
    ).toBe(false)
    expect(
      mobileResponseSchema.safeParse({
        type: 'tool_result',
        session_id: 's',
        tool_call_id: '',
        result: { status: 'success' },
      }).success,
    ).toBe(false)
  })

  it('rejects a malformed inner result payload', () => {
    const parsed = mobileResponseSchema.safeParse({
      type: 'tool_result',
      session_id: 's',
      tool_call_id: 't',
      result: { status: 'unknown' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('toolResultBodySchema / toolRejectedBodySchema (direct)', () => {
  it('toolResultBodySchema validates the literal `tool_result` type', () => {
    const parsed = toolResultBodySchema.safeParse({
      type: 'tool_rejected',
      session_id: 's',
      tool_call_id: 't',
      result: { status: 'success' },
    })
    expect(parsed.success).toBe(false)
  })

  it('toolRejectedBodySchema validates the literal `tool_rejected` type', () => {
    const parsed = toolRejectedBodySchema.safeParse({
      type: 'tool_result',
      session_id: 's',
      tool_call_id: 't',
      reason: 'user_declined',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('progressRequestSchema', () => {
  it('accepts a minimal session_id + tool_call_id', () => {
    const parsed = progressRequestSchema.safeParse({
      session_id: 's',
      tool_call_id: 't',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts the optional reason field', () => {
    const parsed = progressRequestSchema.safeParse({
      session_id: 's',
      tool_call_id: 't',
      reason: 'still waiting',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects empty session_id or tool_call_id', () => {
    expect(
      progressRequestSchema.safeParse({ session_id: '', tool_call_id: 't' })
        .success,
    ).toBe(false)
    expect(
      progressRequestSchema.safeParse({ session_id: 's', tool_call_id: '' })
        .success,
    ).toBe(false)
  })

  it('rejects when required fields are missing', () => {
    expect(progressRequestSchema.safeParse({}).success).toBe(false)
    expect(
      progressRequestSchema.safeParse({ session_id: 's' }).success,
    ).toBe(false)
  })
})
