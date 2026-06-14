import type { ModelMessage } from 'ai'
import { sanitizeMessages } from './sanitize-messages'

describe('sanitizeMessages', () => {
  it('returns user/assistant messages unchanged', () => {
    const messages = [
      { role: 'user', content: 'send 1 USDC to alice' },
      { role: 'assistant', content: 'okay, processing' },
    ] as unknown as ModelMessage[]
    const out = sanitizeMessages(messages)
    expect(out).toEqual(messages)
  })

  it('redacts voucher_code on tool messages', () => {
    const messages = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'execute_redemption',
            output: {
              type: 'json',
              value: {
                status: 'approved_and_executed',
                data: { voucher_code: 'SECRET-12345' },
              },
            },
          },
        ],
      },
    ] as unknown as ModelMessage[]
    const out = sanitizeMessages(messages) as unknown as Array<{
      content: Array<{ output: { value: { data: { voucher_code: string } } } }>
    }>
    expect(out[0].content[0].output.value.data.voucher_code).toBe('[REDACTED]')
  })

  it('redacts every sensitive field name across nested objects and arrays', () => {
    const messages = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            output: {
              type: 'json',
              value: {
                arr: [
                  { private_key: 'pk', other: 'safe' },
                  { mnemonic: 'm', seed_phrase: 's' },
                ],
                nested: {
                  password: 'secret',
                  pin: '1234',
                  otp: '999',
                  secret: 'shh',
                },
              },
            },
          },
        ],
      },
    ] as unknown as ModelMessage[]

    const out = sanitizeMessages(messages) as unknown as Array<{
      content: Array<{
        output: {
          value: {
            arr: Array<Record<string, string>>
            nested: Record<string, string>
          }
        }
      }>
    }>
    const value = out[0].content[0].output.value
    expect(value.arr[0].private_key).toBe('[REDACTED]')
    expect(value.arr[0].other).toBe('safe')
    expect(value.arr[1].mnemonic).toBe('[REDACTED]')
    expect(value.arr[1].seed_phrase).toBe('[REDACTED]')
    expect(value.nested.password).toBe('[REDACTED]')
    expect(value.nested.pin).toBe('[REDACTED]')
    expect(value.nested.otp).toBe('[REDACTED]')
    expect(value.nested.secret).toBe('[REDACTED]')
  })

  it('does NOT mutate the input messages', () => {
    const message: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'execute_redemption',
          output: {
            type: 'json',
            value: { voucher_code: 'KEEP-INPUT-INTACT' },
          },
        },
      ],
    } as unknown as ModelMessage

    const messages = [message]
    sanitizeMessages(messages)
    // Original reference unchanged
    expect(
      (
        message.content as Array<{ output: { value: { voucher_code: string } } }>
      )[0].output.value.voucher_code,
    ).toBe('KEEP-INPUT-INTACT')
  })

  it('leaves a tool message with no sensitive fields untouched', () => {
    const messages = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-2',
            toolName: 'get_balance',
            output: {
              type: 'json',
              value: { balance_wei: '1000', balance_display: '0.001' },
            },
          },
        ],
      },
    ] as unknown as ModelMessage[]
    const out = sanitizeMessages(messages) as unknown as Array<{
      content: Array<{
        output: { value: { balance_wei: string; balance_display: string } }
      }>
    }>
    expect(out[0].content[0].output.value.balance_wei).toBe('1000')
    expect(out[0].content[0].output.value.balance_display).toBe('0.001')
  })

  it('handles an empty array', () => {
    expect(sanitizeMessages([])).toEqual([])
  })

  it('preserves non-string sensitive field values as `[REDACTED]`', () => {
    // Even if the model encodes a credential as something other than a string
    // (number/array/object), the guard should still scrub it.
    const messages = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            output: {
              type: 'json',
              value: { pin: 1234, password: { hashed: 'abc' } },
            },
          },
        ],
      },
    ] as unknown as ModelMessage[]
    const out = sanitizeMessages(messages) as unknown as Array<{
      content: Array<{ output: { value: { pin: string; password: string } } }>
    }>
    expect(out[0].content[0].output.value.pin).toBe('[REDACTED]')
    expect(out[0].content[0].output.value.password).toBe('[REDACTED]')
  })
})
