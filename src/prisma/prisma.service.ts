import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../../generated/prisma'
import type { Prisma } from '../../generated/prisma'
import { ValkeyService } from '../valkey/valkey.service'
import { toConversationSummary, type ConversationSummary } from '../history/conversation.types'

const CACHE_TTL_S = 300

function convListKey(walletAddress: string): string {
  return `takumi:conv:list:${walletAddress.toLowerCase()}`
}

function makePrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])
}

type PrismaClientType = PrismaClient

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  private readonly rawClient: PrismaClientType = makePrismaClient()

  // Expose Prisma models directly on the service
  get conversation() {
    return this.rawClient.conversation
  }
  get message() {
    return this.rawClient.message
  }
  get agentTask() {
    return this.rawClient.agentTask
  }
  get agentPeerMessage() {
    return this.rawClient.agentPeerMessage
  }
  get $transaction() {
    return this.rawClient.$transaction.bind(this.rawClient)
  }

  constructor(private readonly valkey: ValkeyService) {}

  async onModuleInit() {
    await this.rawClient.$connect()
  }

  async onModuleDestroy() {
    await this.rawClient.$disconnect()
  }

  // ── Cache-aware conversation list ─────────────────────────────────

  async findManyConversations(
    args?: Parameters<PrismaClientType['conversation']['findMany']>[0],
  ) {
    return this.rawClient.conversation.findMany(args ?? {})
  }

  /**
   * Returns a cached list of `ConversationSummary` objects for the given
   * wallet address. The cache stores summaries (not raw Prisma rows) so
   * the read and write paths share a consistent shape.
   */
  async listConversationSummaries(
    walletAddress: string,
    take: number,
    cursor?: Date,
  ): Promise<ConversationSummary[]> {
    const isCacheable = take <= 10 && !cursor

    if (isCacheable) {
      const cached = await this.valkey.get(convListKey(walletAddress))
      if (cached) {
        return JSON.parse(cached) as ConversationSummary[]
      }
    }

    const rows = await this.rawClient.conversation.findMany({
      where: {
        walletAddress,
        ...(cursor ? { updatedAt: { lt: cursor } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { contentJson: true, role: true },
        },
      },
    })

    const summaries = rows.map(toConversationSummary)

    if (isCacheable) {
      await this.valkey.setex(convListKey(walletAddress), CACHE_TTL_S, JSON.stringify(summaries))
    }

    return summaries
  }

  async createConversation(
    args: Parameters<PrismaClientType['conversation']['create']>[0],
  ) {
    const result = await this.rawClient.conversation.create(args)
    const wallet = result.walletAddress
    if (wallet) {
      this.recomputeCache(wallet).catch((err: Error) =>
        this.logger.warn(`Cache recompute failed for ${wallet}: ${err.message}`)
      )
    }
    return result
  }

  async updateConversation(
    args: Parameters<PrismaClientType['conversation']['update']>[0],
  ) {
    const result = await this.rawClient.conversation.update(args)
    const wallet = result.walletAddress
    if (wallet) {
      this.recomputeCache(wallet).catch((err: Error) =>
        this.logger.warn(`Cache recompute failed for ${wallet}: ${err.message}`)
      )
    }
    return result
  }

  async updateManyConversations(
    args: Parameters<PrismaClientType['conversation']['updateMany']>[0],
  ) {
    // For updateMany we don't have the wallet easily — just delegate
    return this.rawClient.conversation.updateMany(args)
  }

  async deleteManyConversations(
    args: Parameters<PrismaClientType['conversation']['deleteMany']>[0],
  ) {
    // Read wallet before deleting so we can bust the cache
    const toDelete = await this.rawClient.conversation.findMany({
      where: (args?.where ?? {}) as Prisma.ConversationWhereInput,
      select: { walletAddress: true },
    })
    const result = await this.rawClient.conversation.deleteMany(args)
    const wallets = [...new Set(toDelete.map((c) => c.walletAddress))]
    for (const wallet of wallets) {
      this.recomputeCache(wallet).catch((err: Error) =>
        this.logger.warn(`Cache recompute failed for ${wallet}: ${err.message}`)
      )
    }
    return result
  }

  async findFirstConversation(
    args: Parameters<PrismaClientType['conversation']['findFirst']>[0],
  ) {
    return this.rawClient.conversation.findFirst(args)
  }

  async findFirstOrThrowConversation(
    args: Parameters<PrismaClientType['conversation']['findFirstOrThrow']>[0],
  ) {
    return this.rawClient.conversation.findFirstOrThrow(args)
  }

  async createManyMessages(
    args: Parameters<PrismaClientType['message']['createMany']>[0],
  ) {
    return this.rawClient.message.createMany(args)
  }

  private async recomputeCache(walletAddress: string): Promise<void> {
    const fresh = await this.rawClient.conversation.findMany({
      where: { walletAddress },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { contentJson: true, role: true },
        },
      },
    })

    const summaries = fresh.map(toConversationSummary)
    await this.valkey.setex(convListKey(walletAddress), CACHE_TTL_S, JSON.stringify(summaries))
  }
}
