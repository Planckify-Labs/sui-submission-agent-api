import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createOpenAI } from '@ai-sdk/openai'
import { convertToModelMessages, stepCountIs, streamText, UIMessage } from 'ai'
import { MCPClientService } from './mcp-client.service'

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  constructor(
    private configService: ConfigService,
    private mcpClientService: MCPClientService,
  ) {}

  async streamChatResponse(messages: UIMessage[]) {
    const apiKey = this.configService.get<string>('KIMI_K2_API_KEY')
    if (!apiKey) {
      throw new Error(
        'API key not configured. Please set KIMI_K2_API_KEY in your environment.',
      )
    }

    const kimi = createOpenAI({
      apiKey,
      baseURL: 'https://api.moonshot.ai/v1',
    })

    let tools = {}
    try {
      tools = await this.mcpClientService.getTools()
      this.logger.log(`Providing ${Object.keys(tools).length} MCP tools to AI model`)
    } catch (error) {
      this.logger.error('Failed to retrieve MCP tools, continuing without tools', error)
    }

    const result = streamText({
      model: kimi.chat('kimi-k2-0711-preview'),
      messages: await convertToModelMessages(messages),
      tools,
      maxRetries: 2,
      stopWhen: stepCountIs(5)
    })

    return result.toUIMessageStreamResponse({
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'none',
      },
    })
  }
}
