import { Injectable, NotFoundException } from '@nestjs/common'
import type { ModelMessage } from 'ai'
import type { Conversation } from '../../generated/prisma'
import { PrismaService } from '../prisma/prisma.service'
import {
  type ConversationSummary,
  type ConversationWithMessages,
} from './conversation.types'
import { deriveTitle } from './derive-title'
import { sanitizeMessages } from './sanitize-messages'

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(
    walletAddress: string,
    chainId: number,
    firstUserMessage: ModelMessage,
  ): Promise<Conversation> {
    const title = deriveTitle(firstUserMessage)
    return this.prisma.createConversation({
      data: {
        walletAddress,
        chainId,
        title: title || 'New conversation',
      },
    })
  }

  async appendMessages(conversationId: string, messages: ModelMessage[]): Promise<void> {
    const sanitized = sanitizeMessages(messages)

    // Sequential `createdAt` per row so reload order is deterministic.
    // Without this, `createManyMessages` puts the whole slice in a
    // single INSERT and Postgres gives every row the same `now()` —
    // `orderBy: { createdAt: 'asc' }` then returns them in arbitrary
    // order. That breaks Moonshot/OpenAI-compatible providers, which
    // reject a `role: "tool"` message that isn't immediately preceded
    // by an `assistant` with the matching `tool_calls`.
    //
    // Stepping by 1 ms is enough: persistence is best-effort and
    // happens once per assistant/tool segment, never thousands of
    // times within the same millisecond.
    const base = Date.now()
    await this.prisma.createManyMessages({
      data: sanitized.map((msg, i) => ({
        conversationId,
        role: msg.role,
        contentJson: msg.content as object,
        createdAt: new Date(base + i),
      })),
    })

    // Touch updatedAt so the conversation floats to the top of the list
    await this.prisma.updateConversation({
      where: { id: conversationId },
      data: {},
    })
  }

  async listConversations(
    walletAddress: string,
    cursor?: Date,
    limit?: number,
  ): Promise<ConversationSummary[]> {
    const take = Math.min(limit ?? 10, 10)
    return this.prisma.listConversationSummaries(walletAddress, take, cursor)
  }

  async getConversation(
    id: string,
    walletAddress: string,
  ): Promise<ConversationWithMessages | null> {
    return this.prisma.findFirstConversation({
      where: { id, walletAddress },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    }) as Promise<ConversationWithMessages | null>
  }

  /**
   * Multi-agent task transcript for one conversation. Debug-only —
   * the conversations controller gates this behind
   * `EXPOSE_AGENT_TASK_TRANSCRIPTS=true` so the production response
   * omits the field entirely (spec §8, Task 15).
   *
   * Returns an empty list if no tasks exist for the conversation;
   * callers should not interpret an empty list as "feature disabled".
   */
  async listAgentTasks(conversationId: string) {
    return this.prisma.agentTask.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        peerMessages: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  async deleteConversation(id: string, walletAddress: string): Promise<void> {
    const { count } = await this.prisma.deleteManyConversations({
      where: { id, walletAddress },
    })
    if (count === 0) {
      throw new NotFoundException({ code: 'conversation_not_found' })
    }
  }

  async updateTitle(id: string, walletAddress: string, title: string): Promise<Conversation> {
    const { count } = await this.prisma.updateManyConversations({
      where: { id, walletAddress },
      data: { title },
    })

    if (count === 0) {
      throw new NotFoundException({ code: 'conversation_not_found' })
    }

    return this.prisma.findFirstOrThrowConversation({
      where: { id, walletAddress },
    })
  }
}
