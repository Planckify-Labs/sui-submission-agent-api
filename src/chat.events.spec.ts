import { encodeSseEvent, type AgentEvent } from './chat.events'

describe('encodeSseEvent', () => {
  it('produces the canonical `event: <name>\\ndata: <json>\\n\\n` frame', () => {
    const out = encodeSseEvent({
      event: 'status',
      data: { message: 'Thinking…' },
    })
    expect(out).toBe('event: status\ndata: {"message":"Thinking…"}\n\n')
  })

  it('serialises object data via JSON.stringify (preserves nested fields)', () => {
    const out = encodeSseEvent({
      event: 'tool_executed',
      data: {
        tool_call_id: 'tc-1',
        name: 'get_balance',
        result: { balance_wei: '1000', symbol: 'ETH' },
      },
    })
    expect(out).toContain('event: tool_executed\n')
    expect(out).toContain(
      'data: {"tool_call_id":"tc-1","name":"get_balance","result":{"balance_wei":"1000","symbol":"ETH"}}',
    )
    expect(out.endsWith('\n\n')).toBe(true)
  })

  it('serialises array, null, boolean, and number data', () => {
    expect(encodeSseEvent({ event: 'x', data: [1, 2, 3] })).toContain(
      'data: [1,2,3]\n\n',
    )
    expect(encodeSseEvent({ event: 'x', data: null })).toContain(
      'data: null\n\n',
    )
    expect(encodeSseEvent({ event: 'x', data: true })).toContain(
      'data: true\n\n',
    )
    expect(encodeSseEvent({ event: 'x', data: 42 })).toContain('data: 42\n\n')
  })

  it('serialises a string `data` value as a JSON string literal', () => {
    expect(encodeSseEvent({ event: 'x', data: 'hello' })).toBe(
      'event: x\ndata: "hello"\n\n',
    )
  })

  it('encodes every variant of the AgentEvent union', () => {
    const events: AgentEvent[] = [
      { event: 'status', data: { message: 'Thinking…' } },
      { event: 'text_delta', data: { content: 'hi' } },
      {
        event: 'tool_pending',
        data: {
          session_id: 's',
          tool_call_id: 't',
          name: 'send_native_token',
          input: { to: '0x0', value: '1' },
          meta: {
            executor: 'mobile',
            capability: 'write',
            category: 'blockchain_write',
            human_summary: 'Send 1 wei to 0x0',
          },
        },
      },
      {
        event: 'tool_executed',
        data: { tool_call_id: 't', name: 'r', result: { ok: true } },
      },
      { event: 'done', data: { session_id: 's' } },
      {
        event: 'error',
        data: { code: 'tool_timeout', message: 'timed out', retryable: true },
      },
    ]
    for (const evt of events) {
      const frame = encodeSseEvent(evt)
      expect(frame.startsWith(`event: ${evt.event}\n`)).toBe(true)
      expect(frame.endsWith('\n\n')).toBe(true)
      expect(frame.includes('data: ')).toBe(true)
    }
  })

  it('keeps the JSON on a single line for typical small payloads', () => {
    // SSE frames must never contain raw newlines inside the `data:` segment
    // unless they are CRLF-encoded — `JSON.stringify` (no indent) produces a
    // single line which is the only shape we accept here.
    const out = encodeSseEvent({
      event: 'done',
      data: {
        session_id: 's',
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      },
    })
    // Slice off the leading `event: done\n` and the trailing `\n\n`. What is
    // left is exactly one `data: {...}` line — no embedded newlines.
    const middle = out.slice('event: done\n'.length, -'\n\n'.length)
    expect(middle.includes('\n')).toBe(false)
    expect(middle.startsWith('data: ')).toBe(true)
  })
})
