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

    await this.prisma.createManyMessages({
      data: sanitized.map((msg) => ({
        conversationId,
        role: msg.role,
        contentJson: msg.content as object,
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
