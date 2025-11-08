import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { anthropic } from '@ai-sdk/anthropic'
import { convertToModelMessages, streamText, UIMessage } from 'ai'

@Injectable()
export class ChatService {
  constructor(private configService: ConfigService) {}

  streamChatResponse(messages: UIMessage[]) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY')
    if (!apiKey) {
      throw new Error(
        'API key not configured. Please set ANTHROPIC_API_KEY in your environment.',
      )
    }

    const result = streamText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: convertToModelMessages(messages),
      maxRetries: 2,
    })

    return result.toUIMessageStreamResponse({
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'none',
      },
    })
  }
}
