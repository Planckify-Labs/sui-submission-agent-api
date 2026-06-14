/**
 * AgentTask + AgentPeerMessage store contract.
 *
 * Spec: docs/multi-agent-architecture-spec.md §8.2.
 *
 * This module exposes the *contract* the orchestrator depends on
 * (`TaskStore`) plus a minimal in-memory implementation
 * (`createInMemoryTaskStore`) used by tests and as the default until
 * Task 14 lands the Prisma schema + Task 15 wires the real store.
 *
 * The real store (Task 15) implements the same contract against
 * Prisma's `agentTask` / `agentPeerMessage` tables. Orchestrator code
 * imports only the interface; the wiring decides which backing store
 * is used.
 */

import { randomUUID } from 'node:crypto'

import type {
  AgentId,
  AgentPeerMessage,
  AgentTask,
  AgentTaskStatus,
} from '../types'

export interface CreateTaskInput {
  conversation_id: string
  owner_agent: AgentId
  parent_task_id?: string
  brief: string
  input: unknown
}

export interface AppendPeerMessageInput {
  task_id: string
  message: AgentPeerMessage
}

const VALID_TRANSITIONS: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  pending: ['working', 'failed'],
  working: ['completed', 'failed'],
  completed: [],
  failed: [],
}

export interface TaskStore {
  createTask(input: CreateTaskInput): Promise<AgentTask>
  transitionTask(
    taskId: string,
    next: AgentTaskStatus,
    output?: unknown,
  ): Promise<AgentTask>
  appendPeerMessage(input: AppendPeerMessageInput): Promise<AgentPeerMessage>
  listTasksForConversation(
    conversationId: string,
  ): Promise<Array<AgentTask & { peer_messages: AgentPeerMessage[] }>>
}

export function createInMemoryTaskStore(): TaskStore {
  const tasks = new Map<string, AgentTask>()
  const peer = new Map<string, AgentPeerMessage[]>()

  return {
    createTask(input) {
      const now = new Date()
      const task: AgentTask = {
        id: randomUUID(),
        conversation_id: input.conversation_id,
        owner_agent: input.owner_agent,
        parent_task_id: input.parent_task_id,
        brief: input.brief,
        input: input.input,
        status: 'pending',
        created_at: now,
        updated_at: now,
      }
      tasks.set(task.id, task)
      peer.set(task.id, [])
      return Promise.resolve(task)
    },

    transitionTask(taskId, next, output) {
      const task = tasks.get(taskId)
      if (!task) {
        return Promise.reject(new Error(`[tasks/store] no such task "${taskId}"`))
      }
      const allowed = VALID_TRANSITIONS[task.status]
      if (!allowed.includes(next)) {
        return Promise.reject(
          new Error(
            `[tasks/store] illegal transition: ${task.status} → ${next} for task "${taskId}"`,
          ),
        )
      }
      const updated: AgentTask = {
        ...task,
        status: next,
        output: output ?? task.output,
        updated_at: new Date(),
      }
      tasks.set(taskId, updated)
      return Promise.resolve(updated)
    },

    appendPeerMessage(input) {
      if (!tasks.has(input.task_id)) {
        return Promise.reject(
          new Error(
            `[tasks/store] cannot append peer message to missing task "${input.task_id}"`,
          ),
        )
      }
      const list = peer.get(input.task_id) ?? []
      list.push(input.message)
      peer.set(input.task_id, list)
      return Promise.resolve(input.message)
    },

    listTasksForConversation(conversationId) {
      const out: Array<AgentTask & { peer_messages: AgentPeerMessage[] }> = []
      for (const task of tasks.values()) {
        if (task.conversation_id !== conversationId) continue
        out.push({
          ...task,
          peer_messages: peer.get(task.id) ?? [],
        })
      }
      out.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      return Promise.resolve(out)
    },
  }
}
