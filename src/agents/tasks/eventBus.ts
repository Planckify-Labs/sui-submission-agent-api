/**
 * In-process peer-message event bus.
 *
 * Spec: docs/multi-agent-architecture-spec.md §6.3.
 *
 * NestJS EventEmitter is sufficient for v1 (peer messages never leave
 * the orchestrator process). The bus is best-effort: a throwing
 * listener is caught and logged in `__DEV__` mode; the orchestrator
 * must not block on bus delivery (§6.3, §15.4).
 *
 * Heavier transports (Redis pub/sub for multi-process orchestrators)
 * are out of scope until a real multi-process agent runtime ships
 * (§1 non-goal).
 */

import type { AgentPeerMessage } from '../types'

export type PeerMessageListener = (message: AgentPeerMessage) => void

export interface PeerMessageBus {
  emit(taskId: string, message: AgentPeerMessage): void
  on(taskId: string, listener: PeerMessageListener): () => void
}

export function createPeerMessageBus(): PeerMessageBus {
  const listeners = new Map<string, Set<PeerMessageListener>>()

  return {
    emit(taskId, message) {
      const set = listeners.get(taskId)
      if (!set) return
      for (const listener of set) {
        try {
          listener(message)
        } catch (err) {
          // CLAUDE.md user-facing-error rule: best-effort delivery,
          // never raise to caller. Raw detail only in __DEV__.
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(
              '[tasks/eventBus] listener threw, suppressing:',
              err instanceof Error ? err.message : err,
            )
          }
        }
      }
    },

    on(taskId, listener) {
      let set = listeners.get(taskId)
      if (!set) {
        set = new Set()
        listeners.set(taskId, set)
      }
      set.add(listener)
      return () => {
        set?.delete(listener)
      }
    },
  }
}
