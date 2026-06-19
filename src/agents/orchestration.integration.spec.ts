import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import {
  ChatService,
  type ModelRunner,
  type StreamTextCall,
} from '../chat.service'
import { MCPClientService } from '../mcp-client.service'
import { SessionService } from '../session/session.service'
import { ConversationService } from '../history/conversation.service'
import type { AgentEvent } from '../chat.events'
import type { Session, WalletContext } from '../session/types'

/**
 * End-to-end-ish check of the multi-agent orchestration on ChatService:
 * Core routes to a specialist, the specialist runs with ITS OWN tools, and
 * the specialist's tool call is dispatched to mobile (`tool_pending`).
 *
 * The model is scripted (no network); we set KIMI_K2_API_KEY so
 * `resolveModel('kimi-k2')` succeeds (the scripted runner ignores the model).
 */

const wallet: WalletContext = {
  address: '0x1111111111111111111111111111111111111111',
  namespace: 'sui',
  chain_id: 0,
  chain_name: 'Sui',
  chain_symbol: 'SUI',
  label: 'Test Wallet',
}

class StubMCPClientService {
  getTools(): Promise<ToolSet> {
    return Promise.resolve({})
  }
  onModuleInit() {
    return Promise.resolve()
  }
  onModuleDestroy() {
    return Promise.resolve()
  }
}

class StubConversationService {
  getConversation() {
    return Promise.resolve(null)
  }
  createConversation() {
    return Promise.resolve({ id: 'stub-conv', title: 'stub' })
  }
  appendMessages() {
    return Promise.resolve()
  }
}

interface ScriptedStep {
  text?: string
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>
}

function makeScriptedRunner(script: ScriptedStep[]): ModelRunner {
  let i = 0
  return () => {
    const step: ScriptedStep = script[i++] ?? {}
    const chunks = step.text ? [step.text] : []
    const textStream: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        for (const c of chunks) yield c
      },
    }
    const call: StreamTextCall = {
      textStream,
      toolCalls: Promise.resolve(step.toolCalls ?? []),
    }
    return call
  }
}

async function collectUntil(
  gen: AsyncGenerator<AgentEvent>,
  predicate: (e: AgentEvent) => boolean,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  while (true) {
    const { value, done } = await gen.next()
    if (done) return out
    out.push(value)
    if (predicate(value)) return out
  }
}

describe('multi-agent orchestration (ChatService)', () => {
  let moduleRef: TestingModule
  let chatService: ChatService
  let sessionService: SessionService
  const HAD_KEY = process.env.KIMI_K2_API_KEY

  beforeEach(async () => {
    process.env.KIMI_K2_API_KEY = 'sk-test'
    moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        SessionService,
        {
          provide: ConfigService,
          useValue: { get: (_k: string, fallback?: string) => fallback },
        },
        { provide: MCPClientService, useClass: StubMCPClientService },
        { provide: ConversationService, useClass: StubConversationService },
      ],
    }).compile()
    chatService = moduleRef.get(ChatService)
    sessionService = moduleRef.get(SessionService)
  })

  afterEach(async () => {
    if (HAD_KEY === undefined) delete process.env.KIMI_K2_API_KEY
    else process.env.KIMI_K2_API_KEY = HAD_KEY
    await moduleRef.close()
  })

  function seedSession(userText: string): Session {
    const session = sessionService.create(wallet)
    session.messages.push({ role: 'user', content: userText } as ModelMessage)
    return session
  }

  it('Core routes a swap to DeFi; the DeFi specialist dispatches its own tool', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([
        // Step 0 — Core router: delegate to the DeFi specialist.
        {
          toolCalls: [
            {
              toolCallId: 'tc-route',
              toolName: 'core_handoff',
              input: { to: 'defi', brief: 'swap 2 SUI to USDC' },
            },
          ],
        },
        // Step 1 — DeFi specialist: preview the swap (a defi-owned tool).
        {
          toolCalls: [
            {
              toolCallId: 'tc-preview',
              toolName: 'defi_intent_preview',
              input: { action: 'swap', fromAsset: 'SUI', toAsset: 'USDC' },
            },
          ],
        },
      ]),
    )

    const session = seedSession('Swap 2 SUI to USDC')
    const events = await collectUntil(
      chatService.orchestratedLoop(session),
      (e) => e.event === 'tool_pending',
    )

    const pending = events.find((e) => e.event === 'tool_pending')
    expect(pending).toBeDefined()
    // The DeFi specialist (not Core, not Wallet) drove the tool call.
    expect((pending as { data: { name: string } }).data.name).toBe(
      'defi_intent_preview',
    )
    // It is correctly classified as a mobile read with an approval-free
    // capability — proving it went through the real registry, not a stub.
    expect((pending as { data: { meta: { capability: string } } }).data.meta.capability).toBe(
      'read',
    )
  })

  it('Core answers small talk directly — no specialist, just text + done', async () => {
    chatService.setModelRunner(
      makeScriptedRunner([{ text: 'Hi! I can help with your wallet and swaps.' }]),
    )
    const session = seedSession('hello')
    const events: AgentEvent[] = []
    for await (const e of chatService.orchestratedLoop(session)) events.push(e)

    expect(events.some((e) => e.event === 'text_delta')).toBe(true)
    expect(events.some((e) => e.event === 'tool_pending')).toBe(false)
    expect(events.at(-1)?.event).toBe('done')
  })
})
