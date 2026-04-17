import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  NotFoundException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { ApiKeyGuard } from '../guards/api-key.guard'
import { ConversationService } from './conversation.service'
import type { ConversationSummary } from './conversation.types'

// Accepts either an EVM `0x`-hex address or a Solana base58 public key.
// Kept permissive (min/max only) because the history endpoints only
// use the value as an opaque lookup key — format validation is the
// wallet's job at sign time.
const ethereumAddressSchema = z.string().min(1).max(128)

const listConversationsSchema = z.object({
  wallet_address: ethereumAddressSchema,
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Number(v) : undefined))
    .pipe(z.number().int().min(1).max(50).optional()),
})

const deleteConversationSchema = z.object({
  wallet_address: ethereumAddressSchema,
})

const updateTitleSchema = z.object({
  wallet_address: ethereumAddressSchema,
  title: z.string().min(1).max(200),
})

export interface ConversationListResponse {
  items: ConversationSummary[]
  next_cursor: string | null
}

export interface ConversationDetailResponse {
  id: string
  title: string
  wallet_address: string
  chain_id: number
  created_at: string
  updated_at: string
  messages: unknown[]
}

@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class ConversationsController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  async list(@Query() query: unknown): Promise<ConversationListResponse> {
    const parsed = listConversationsSchema.safeParse(query)
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        details: parsed.error.issues,
      })
    }

    const { wallet_address, cursor, limit } = parsed.data
    const cursorDate = cursor ? new Date(cursor) : undefined
    const items = await this.conversationService.listConversations(wallet_address, cursorDate, limit)

    const next_cursor =
      items.length === Math.min(limit ?? 10, 10)
        ? (items[items.length - 1]?.updated_at ?? null)
        : null

    return { items, next_cursor }
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('wallet_address') walletAddress: unknown,
  ): Promise<ConversationDetailResponse> {
    const addrParsed = ethereumAddressSchema.safeParse(walletAddress)
    if (!addrParsed.success) {
      throw new BadRequestException({ code: 'invalid_request', message: 'Invalid wallet_address' })
    }

    const conv = await this.conversationService.getConversation(id, addrParsed.data)
    if (!conv) {
      throw new NotFoundException({ code: 'conversation_not_found' })
    }

    return {
      id: conv.id,
      title: conv.title,
      wallet_address: conv.walletAddress,
      chain_id: conv.chainId,
      created_at: conv.createdAt.toISOString(),
      updated_at: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => ({
        role: m.role,
        content: m.contentJson,
        created_at: m.createdAt.toISOString(),
      })),
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @Body() body: unknown): Promise<void> {
    const parsed = deleteConversationSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        details: parsed.error.issues,
      })
    }

    await this.conversationService.deleteConversation(id, parsed.data.wallet_address)
  }

  @Patch(':id/title')
  async updateTitle(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ id: string; title: string }> {
    const parsed = updateTitleSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        details: parsed.error.issues,
      })
    }

    const updated = await this.conversationService.updateTitle(
      id,
      parsed.data.wallet_address,
      parsed.data.title,
    )
    return { id: updated.id, title: updated.title }
  }
}
