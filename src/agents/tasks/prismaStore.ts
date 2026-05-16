/**
 * Prisma-backed `TaskStore`.
 *
 * Spec: docs/multi-agent-architecture-spec.md §8.2.
 *
 * Mirrors `createInMemoryTaskStore()` in `./store.ts` — exposes the
 * same contract; the orchestrator depends only on the interface. The
 * in-memory store stays around for tests; this one is wired into the
 * NestJS module in production.
 *
 * Hard rules (Task 15):
 *  - This module is the only writer to the new tables. Orchestrator
 *    and event bus never touch Prisma directly.
 *  - Illegal status transitions throw with a structured error (the
 *    orchestrator translates to friendly copy — CLAUDE.md).
 *  - No PII / no raw error detail in `brief` or `body` — short
 *    summaries only.
 */

import type {
  AgentPeerMessage,
  AgentTask,
  AgentTaskStatus,
} from '../types'
import type {
  AppendPeerMessageInput,
  CreateTaskInput,
  TaskStore,
} from './store'

interface AgentTaskRow {
  id: string
  conversationId: string
  ownerAgent: string
  parentTaskId: string | null
  brief: string
  inputJson: unknown
  status: string
  outputJson: unknown
  createdAt: Date
  updatedAt: Date
}

interface AgentPeerMessageRow {
  id: string
  taskId: string
  fromAgent: string
  toAgent: string
  kind: string
  body: string
  attachments: unknown
  createdAt: Date
}

/**
 * Minimal subset of `PrismaService` this module needs — declared as an
 * interface so tests can pass a mock without dragging in the real
 * client.
 */
export interface TaskStorePrisma {
  agentTask: {
    create(args: { data: unknown }): Promise<AgentTaskRow>
    findUniqueOrThrow(args: { where: { id: string } }): Promise<AgentTaskRow>
    update(args: { where: { id: string }; data: unknown }): Promise<AgentTaskRow>
    findMany(args: unknown): Promise<
      Array<AgentTaskRow & { peerMessages: AgentPeerMessageRow[] }>
    >
  }
  agentPeerMessage: {
    create(args: { data: unknown }): Promise<AgentPeerMessageRow>
  }
}

const VALID_TRANSITIONS: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  pending: ['working', 'failed'],
  working: ['completed', 'failed'],
  completed: [],
  failed: [],
}

function rowToTask(row: AgentTaskRow): AgentTask {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    owner_agent: row.ownerAgent,
    parent_task_id: row.parentTaskId ?? undefined,
    brief: row.brief,
    input: row.inputJson,
    status: row.status as AgentTaskStatus,
    output: row.outputJson ?? undefined,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

function rowToPeer(row: AgentPeerMessageRow): AgentPeerMessage {
  return {
    from: row.fromAgent,
    to: row.toAgent,
    kind: row.kind as AgentPeerMessage['kind'],
    body: row.body,
    attachments: row.attachments ?? undefined,
  }
}

export function createPrismaTaskStore(prisma: TaskStorePrisma): TaskStore {
  return {
    async createTask(input: CreateTaskInput): Promise<AgentTask> {
      const row = await prisma.agentTask.create({
        data: {
          conversationId: input.conversation_id,
          ownerAgent: input.owner_agent,
          parentTaskId: input.parent_task_id ?? null,
          brief: input.brief,
          inputJson: input.input ?? null,
          status: 'pending',
        },
      })
      return rowToTask(row)
    },

    async transitionTask(
      taskId: string,
      next: AgentTaskStatus,
      output: unknown,
    ): Promise<AgentTask> {
      const current = await prisma.agentTask.findUniqueOrThrow({
        where: { id: taskId },
      })
      const allowed = VALID_TRANSITIONS[current.status as AgentTaskStatus] ?? []
      if (!allowed.includes(next)) {
        throw new Error(
          `[tasks/prismaStore] illegal transition: ${current.status} → ${next} for task "${taskId}"`,
        )
      }
      const data: Record<string, unknown> = { status: next }
      if (output !== undefined) {
        data.outputJson = output as unknown
      }
      const row = await prisma.agentTask.update({
        where: { id: taskId },
        data,
      })
      return rowToTask(row)
    },

    async appendPeerMessage(
      input: AppendPeerMessageInput,
    ): Promise<AgentPeerMessage> {
      const row = await prisma.agentPeerMessage.create({
        data: {
          taskId: input.task_id,
          fromAgent: input.message.from,
          toAgent: input.message.to,
          kind: input.message.kind,
          body: input.message.body,
          attachments: (input.message.attachments ?? null) as unknown,
        },
      })
      return rowToPeer(row)
    },

    async listTasksForConversation(conversationId: string) {
      const rows = await prisma.agentTask.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        include: {
          peerMessages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      return rows.map((row) => ({
        ...rowToTask(row),
        peer_messages: row.peerMessages.map(rowToPeer),
      }))
    },
  }
}
