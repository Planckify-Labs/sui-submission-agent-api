import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { ModelMessage } from 'ai'
import { ChatService } from './chat.service'
import {
  chatRequestSchema,
  mobileResponseSchema,
  type MobileResponseBody,
} from './chat.schemas'
import { ApiKeyGuard } from './guards/api-key.guard'
import { SessionService } from './session'
import type { MobileResponse, WalletContext } from './session/types'

@UseGuards(ApiKeyGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sessionService: SessionService,
  ) {}

  @Post()
  async post(@Body() payload: unknown): Promise<Response> {
    const parsed = chatRequestSchema.safeParse(payload)
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: 'Malformed chat request body.',
        details: parsed.error.issues,
      })
    }

    const { messages, session_id, wallet_context } = parsed.data

    // Reconnect branch: mobile re-sends /chat with an existing session_id
    // and an empty messages array. See AGENT_PROTOCOL.md §4. The in-flight
    // agent loop keeps running on its original HTTP connection; this call
    // just re-emits outstanding `tool_pending` payloads so the mobile can
    // rebuild its approval UI after an SSE drop.
    if (session_id && messages.length === 0) {
      return this.chatService.buildReconnectResponse(session_id)
    }

    // Fresh turn. Resolve or create the session, fold the new user
    // messages in, and hand the agent loop an SSE response.
    let session = session_id ? this.sessionService.get(session_id) : undefined

    if (!session) {
      if (!wallet_context) {
        throw new BadRequestException({
          code: 'missing_wallet_context',
          message:
            'wallet_context is required when starting a new session (no session_id, or session_id expired).',
        })
      }
      session = this.sessionService.create(wallet_context as WalletContext)
    }

    for (const msg of messages) {
      session.messages.push(msg as unknown as ModelMessage)
    }

    return this.chatService.streamAgentSSE(session)
  }

  /**
   * Mobile posts tool results or rejections back through this endpoint.
   * See AGENT_PROTOCOL.md §8.4.
   *
   * Status codes:
   *  - 204 on success.
   *  - 400 on malformed body.
   *  - 404 if the session is unknown or expired.
   *  - 409 if `tool_call_id` is unknown or already resolved (replay).
   */
  @Post('respond')
  @HttpCode(HttpStatus.NO_CONTENT)
  async respond(@Body() payload: unknown): Promise<void> {
    const parsed = mobileResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: 'Malformed /chat/respond body.',
        details: parsed.error.issues,
      })
    }

    const body: MobileResponseBody = parsed.data

    const session = this.sessionService.get(body.session_id)
    if (!session) {
      throw new NotFoundException({
        code: 'session_expired',
        message: 'Session not found or expired.',
      })
    }

    try {
      this.sessionService.resolveMobileResult(
        body.session_id,
        body.tool_call_id,
        body as MobileResponse,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // `SessionService.resolveMobileResult` throws for three cases: session
      // not found, session expired, and unknown/already-resolved tool call.
      // The first two became 404 above via `get()`; anything left here is
      // a replay or unknown tool_call_id → 409.
      if (/not found/i.test(message) || /expired/i.test(message)) {
        throw new NotFoundException({
          code: 'session_expired',
          message: 'Session not found or expired.',
        })
      }

      throw new ConflictException({
        code: 'tool_call_already_resolved',
        message,
      })
    }
  }
}
