import { toConversationSummary } from './conversation.types'

type RawConv = Parameters<typeof toConversationSummary>[0]

function makeRow(overrides: Partial<RawConv> = {}): RawConv {
  const created = new Date('2026-05-01T10:00:00.000Z')
  const updated = new Date('2026-05-09T12:34:56.000Z')
  return {
    id: 'conv-1',
    title: 'Test conversation',
    walletAddress: '0xabc',
    chainId: 137,
    createdAt: created,
    updatedAt: updated,
    messages: [],
    ...overrides,
  } as unknown as RawConv
}

describe('toConversationSummary', () => {
  it('emits the basic shape with ISO timestamps and message_count', () => {
    const summary = toConversationSummary(makeRow())
    expect(summary).toEqual({
      id: 'conv-1',
      title: 'Test conversation',
      wallet_address: '0xabc',
      chain_id: 137,
      created_at: '2026-05-01T10:00:00.000Z',
      updated_at: '2026-05-09T12:34:56.000Z',
      message_count: 0,
      last_message_preview: '',
    })
  })

  it('extracts a string-content preview from the first message and trims to 120 chars', () => {
    const long = 'a'.repeat(200)
    const summary = toConversationSummary(
      makeRow({
        messages: [{ contentJson: long, role: 'assistant' }],
      }),
    )
    expect(summary.last_message_preview.length).toBe(120)
    expect(summary.last_message_preview).toBe('a'.repeat(120))
    expect(summary.message_count).toBe(1)
  })

  it('extracts text-part preview from array content', () => {
    const summary = toConversationSummary(
      makeRow({
        messages: [
          {
            contentJson: [
              { type: 'tool-call', name: 'x' },
              { type: 'text', text: 'final assistant reply' },
            ] as unknown as object,
            role: 'assistant',
          },
        ],
      }),
    )
    expect(summary.last_message_preview).toBe('final assistant reply')
  })

  it('extracts preview from object content with a `text` field', () => {
    const summary = toConversationSummary(
      makeRow({
        messages: [
          {
            contentJson: { text: 'object-shaped reply' } as unknown as object,
            role: 'assistant',
          },
        ],
      }),
    )
    expect(summary.last_message_preview).toBe('object-shaped reply')
  })

  it('returns an empty preview when the array content has no text part', () => {
    const summary = toConversationSummary(
      makeRow({
        messages: [
          {
            contentJson: [
              { type: 'tool-call', name: 'x' },
            ] as unknown as object,
            role: 'assistant',
          },
        ],
      }),
    )
    expect(summary.last_message_preview).toBe('')
  })

  it('returns an empty preview when content is an unknown shape', () => {
    const summary = toConversationSummary(
      makeRow({
        messages: [
          { contentJson: 12345 as unknown as object, role: 'assistant' },
        ],
      }),
    )
    expect(summary.last_message_preview).toBe('')
  })

  it('counts the messages array as message_count', () => {
    const summary = toConversationSummary(
      makeRow({
        messages: [
          { contentJson: 'hello', role: 'assistant' },
          { contentJson: 'second', role: 'user' },
        ],
      }),
    )
    // Only the first row contributes to the preview by spec — the function
    // looks at messages[0]. message_count reflects the array length.
    expect(summary.message_count).toBe(2)
    expect(summary.last_message_preview).toBe('hello')
  })
})
