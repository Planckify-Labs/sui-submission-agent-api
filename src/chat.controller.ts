import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common'
import { ChatService } from './chat.service'
import { UIMessage } from 'ai'
import { ApiKeyGuard } from './guards/api-key.guard'

interface ChatRequest {
  messages: UIMessage[]
}

@UseGuards(ApiKeyGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async post(
    @Body()
    payload: ChatRequest,
  ): Promise<Response> {
    try {
      const messages = payload?.messages

      if (!Array.isArray(messages)) {
        throw new BadRequestException('Messages must be an array')
      }

      return this.chatService.streamChatResponse(messages)
    } catch (error: unknown) {
      console.error('Chat API error:', error)

      const err = error as Record<string, unknown>

      if (
        (err?.message as string | undefined)?.includes('overloaded') ||
        err?.type === 'overloaded_error'
      ) {
        throw new ServiceUnavailableException(
          'The AI service is currently experiencing high demand. Please try again in a moment.',
        )
      }

      if (
        (err?.message as string | undefined)?.includes(
          'API key not configured',
        )
      ) {
        throw new InternalServerErrorException(err.message)
      }

      throw new InternalServerErrorException(
        (err?.message as string | undefined) ||
          'An unexpected error occurred. Please try again.',
      )
    }
  }
}
