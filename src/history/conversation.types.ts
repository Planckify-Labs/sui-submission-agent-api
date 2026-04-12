import type { Conversation, Message } from '../../generated/prisma'

export interface ConversationSummary {
  id: string
  title: string
  wallet_address: string
  chain_id: number
  created_at: string
  updated_at: string
  message_count: number
  last_message_preview: string // first 120 chars of last assistant message
}

export type ConversationWithMessages = Conversation & { messages: Message[] }

/**
 * Maps a raw Prisma Conversation row (with its latest message) to
 * the `ConversationSummary` shape consumed by the mobile list UI.
 */
export function toConversationSummary(
  conv: Conversation & {
    messages: Array<{ contentJson: unknown; role: string }>
  },
): ConversationSummary {
  const lastMsg = conv.messages[0]
  let preview = ''
  if (lastMsg) {
    const content = lastMsg.contentJson
    if (typeof content === 'string') {
      preview = content.slice(0, 120)
    } else if (Array.isArray(content)) {
      const textPart = (content as Array<{ type: string; text?: string }>).find(
        (p) => p.type === 'text',
      )
      preview = (textPart?.text ?? '').slice(0, 120)
    } else if (content && typeof content === 'object') {
      const obj = content as Record<string, unknown>
      if (typeof obj.text === 'string') {
        preview = obj.text.slice(0, 120)
      }
    }
  }

  return {
    id: conv.id,
    title: conv.title,
    wallet_address: conv.walletAddress,
    chain_id: conv.chainId,
    created_at: conv.createdAt.toISOString(),
    updated_at: conv.updatedAt.toISOString(),
    message_count: conv.messages.length,
    last_message_preview: preview,
  }
}
