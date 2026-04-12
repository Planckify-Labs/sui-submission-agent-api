import type { ModelMessage } from 'ai'

function extractTextContent(msg: ModelMessage): string {
  const { content } = msg as { content: unknown }
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join(' ')
  }
  return ''
}

export function deriveTitle(firstUserMessage: ModelMessage): string {
  const text = extractTextContent(firstUserMessage)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}
