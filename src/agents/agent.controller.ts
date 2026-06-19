/**
 * Per-agent HTTP endpoint — `POST /agents/:agentId`.
 *
 * Runs ONE named agent for a turn (its own prompt + tools + model), instead
 * of the full Core→specialist orchestration on `POST /chat`. Useful for
 * driving / testing a single specialist in isolation, and gives each agent
 * its own addressable endpoint.
 *
 * Reuses the SAME session machinery and SSE wire protocol as `/chat`, so the
 * mobile round-trip (`POST /chat/respond`) works unchanged. Model choice is
 * server-side (the agent's `config.ts`); the caller never picks a model.
 *
 *   POST /agents/defi    → run the DeFi specialist directly
 *   POST /agents/wallet  → run the Wallet specialist directly
 *   POST /agents/core    → run the full orchestrator (Core routes → specialist)
 */

import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { ModelMessage } from 'ai'
import { ChatService } from '../chat.service'
import { chatRequestSchema } from '../chat.schemas'
import { ApiKeyGuard } from '../guards/api-key.guard'
import { SessionService } from '../session'
import type { WalletContext } from '../session/types'
import { getAgentConfig } from './agentConfig'

@UseGuards(ApiKeyGuard)
@Controller('agents')
export class AgentController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sessionService: SessionService,
  ) {}

  @Post(':agentId')
  async post(
    @Param('agentId') agentId: string,
    @Body() payload: unknown,
  ): Promise<Response> {
    // 'core' is allowed (runs the orchestrator); any other id must be a
    // registered agent. Unknown ids 404 before a stream is opened.
    if (agentId !== 'core' && !getAgentConfig(agentId)) {
      throw new NotFoundException({
        code: 'unknown_agent',
        message: 'No such assistant.',
      })
    }

    const parsed = chatRequestSchema.safeParse(payload)
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: 'Malformed chat request body.',
        details: parsed.error.issues,
      })
    }

    const { messages, session_id, wallet_context } = parsed.data

    let session = session_id ? this.sessionService.get(session_id) : undefined
    if (!session) {
      if (!wallet_context) {
        throw new BadRequestException({
          code: 'missing_wallet_context',
          message: 'wallet_context is required when starting a new session.',
        })
      }
      session = this.sessionService.create(wallet_context as WalletContext)
    } else if (wallet_context) {
      session.wallet_context = wallet_context as WalletContext
      session.chain_id = (wallet_context as WalletContext).chain_id
    }

    for (const msg of messages) {
      session.messages.push(msg as unknown as ModelMessage)
    }

    return this.chatService.streamSingleAgentSSE(session, agentId)
  }
}
