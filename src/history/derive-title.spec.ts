import type { ModelMessage } from 'ai'
import { deriveTitle } from './derive-title'

describe('deriveTitle', () => {
  it('returns a plain string content unchanged when ≤ 80 chars', () => {
    const msg = { role: 'user', content: 'Send 1 USDC to alice' } as ModelMessage
    expect(deriveTitle(msg)).toBe('Send 1 USDC to alice')
  })

  it('truncates to 77 chars + ellipsis when content exceeds 80 chars', () => {
    const long = 'a'.repeat(100)
    const msg = { role: 'user', content: long } as ModelMessage
    const out = deriveTitle(msg)
    expect(out.length).toBe(78) // 77 chars + 1 ellipsis char
    expect(out.endsWith('…')).toBe(true)
    expect(out.slice(0, 77)).toBe('a'.repeat(77))
  })

  it('returns content exactly 80 chars unchanged', () => {
    const exact = 'b'.repeat(80)
    const msg = { role: 'user', content: exact } as ModelMessage
    expect(deriveTitle(msg)).toBe(exact)
  })

  it('extracts text from an array content with `text` parts', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
    } as unknown as ModelMessage
    expect(deriveTitle(msg)).toBe('Hello  world')
  })

  it('skips non-text parts in array content', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'image', url: 'https://x' } as unknown as { type: string },
        { type: 'text', text: 'just this' },
      ],
    } as unknown as ModelMessage
    expect(deriveTitle(msg)).toBe('just this')
  })

  it('returns empty string for unsupported content shapes', () => {
    const msg = {
      role: 'user',
      content: 12345 as unknown as string,
    } as unknown as ModelMessage
    expect(deriveTitle(msg)).toBe('')
  })

  it('returns empty string when array text parts have no text', () => {
    const msg = {
      role: 'user',
      content: [{ type: 'text' } as unknown as { type: string; text: string }],
    } as unknown as ModelMessage
    expect(deriveTitle(msg)).toBe('')
  })

  it('preserves multibyte characters in the truncation boundary', () => {
    // 80-char Indonesian sentence followed by extras to force truncation.
    const msg = {
      role: 'user',
      content: 'Halo, saya ingin menambahkan poin dari saldo USDC saya hari ini juga oke ya ABC extra',
    } as ModelMessage
    const out = deriveTitle(msg)
    expect(out.endsWith('…')).toBe(true)
  })
})
