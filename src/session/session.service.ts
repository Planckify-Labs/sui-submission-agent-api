import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import {
  type Deferred,
  type MobileResponse,
  type Session,
  TimeoutError,
  type ToolPendingPayload,
  type WalletContext,
} from './types'

/**
 * Default mobile-result timeout: 5 minutes.
 * See `AGENT_PROTOCOL.md` §9.
 */
export const MOBILE_RESULT_TIMEOUT_MS = 5 * 60_000

/**
 * Inactivity TTL after which a session is evicted. See §12.
 */
export const SESSION_TTL_MS = 15 * 60_000

/**
 * Create a new Deferred — a Promise with its `resolve`/`reject` exposed.
 */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * In-memory session store + synchronization primitive for the
 * resumable agent loop.
 *
 * Responsibilities (see §4, §9, §12):
 *
 * 1. Create, look up, and evict sessions.
 * 2. Provide `awaitMobileResult` — a promise the agent loop awaits while
 *    a mobile tool call is in flight.
 * 3. Provide `resolveMobileResult` — called by `POST /chat/respond` to
 *    resolve the matching deferred.
 * 4. Store `ToolPendingPayload`s so they can be re-delivered when the
 *    SSE stream reconnects mid-turn.
 *
 * Single-instance / in-memory only. For multi-instance deployments this
 * store needs to be backed by Redis (or similar) — see `// TODO: Redis`
 * markers below.
 */
// TODO: Redis — this Map is single-process only. For multi-instance
// persistence, back `sessions`, `pending`, and `pendingPayloads` with
// Redis (see `AGENT_PROTOCOL.md` §12). Deferreds cannot be serialized,
// so cross-instance coordination requires a pub/sub channel that wakes
// the holding instance when a `POST /chat/respond` lands on another.
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name)
  private readonly sessions = new Map<string, Session>()

  /**
   * Create a fresh session for the given wallet context.
   */
  create(walletCtx: WalletContext): Session {
    const now = new Date()
    const session: Session = {
      id: randomUUID(),
      messages: [],
      wallet_address: walletCtx.address,
      chain_id: walletCtx.chain_id,
      wallet_context: walletCtx,
      state: 'idle',
      pending: new Map(),
      pendingPayloads: new Map(),
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      created_at: now,
      last_active: now,
    }
    this.sessions.set(session.id, session)
    this.logger.debug(`Created session ${session.id} for ${walletCtx.address}`)
    return session
  }

  /**
   * Look up a session by id. Performs a lazy eviction check — sessions
   * inactive for longer than `SESSION_TTL_MS` are removed and `undefined`
   * is returned.
   */
  get(id: string): Session | undefined {
    const session = this.sessions.get(id)
    if (!session) return undefined

    if (this.isExpired(session)) {
      this.logger.debug(`Session ${id} expired on lazy check — evicting`)
      this.evict(session)
      return undefined
    }

    session.last_active = new Date()
    return session
  }

  /**
   * Suspend the agent loop until the mobile wallet returns a result
   * for `toolCallId`. Inserts `payload` into `pendingPayloads` *before*
   * returning the promise so a reconnect arriving between the emit and
   * the mobile response can re-deliver it.
   *
   * Races the deferred against `opts.timeoutMs`. On timeout, rejects
   * with `TimeoutError` and cleans up the entry.
   */
  awaitMobileResult(
    sessionId: string,
    toolCallId: string,
    payload: ToolPendingPayload,
    opts: { timeoutMs?: number } = {},
  ): Promise<MobileResponse> {
    const session = this.sessions.get(sessionId)
    if (!session || this.isExpired(session)) {
      if (session) this.evict(session)
      return Promise.reject(new Error(`Session ${sessionId} not found or expired`))
    }

    if (session.pending.has(toolCallId)) {
      return Promise.reject(
        new Error(
          `Duplicate tool_call_id ${toolCallId} in session ${sessionId}`,
        ),
      )
    }

    const timeoutMs = opts.timeoutMs ?? MOBILE_RESULT_TIMEOUT_MS
    const deferred = createDeferred<MobileResponse>()

    // IMPORTANT: insert payload into `pendingPayloads` *before* returning
    // the promise (see §4). A reconnect that arrives between the emit and
    // the mobile response needs to find the payload here to re-deliver.
    session.pendingPayloads.set(toolCallId, payload)
    session.pending.set(toolCallId, deferred)
    session.state = 'awaiting_mobile'
    session.last_active = new Date()

    let timer: NodeJS.Timeout | undefined
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      session.pending.delete(toolCallId)
      session.pendingPayloads.delete(toolCallId)
      if (session.pending.size === 0 && session.state === 'awaiting_mobile') {
        session.state = 'idle'
      }
    }

    timer = setTimeout(() => {
      if (!session.pending.has(toolCallId)) return
      cleanup()
      deferred.reject(new TimeoutError(sessionId, toolCallId, timeoutMs))
    }, timeoutMs)
    // Allow Node to exit if the timer is the only thing keeping it alive
    // (matters for short-lived test runs).
    if (typeof timer.unref === 'function') timer.unref()

    return deferred.promise.finally(() => {
      // Clean up on both resolve and reject paths. Safe to call twice —
      // Map.delete is idempotent.
      cleanup()
    })
  }

  /**
   * Resolve the deferred associated with `(sessionId, toolCallId)` with
   * `response`. Single-use — a second call with the same id throws
   * (replay protection, §13).
   */
  resolveMobileResult(
    sessionId: string,
    toolCallId: string,
    response: MobileResponse,
  ): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    if (this.isExpired(session)) {
      this.evict(session)
      throw new Error(`Session ${sessionId} expired`)
    }

    const deferred = session.pending.get(toolCallId)
    if (!deferred) {
      // Either never pending or already resolved — treat as replay.
      throw new Error(
        `No pending mobile result for tool_call ${toolCallId} in session ${sessionId} (already resolved or unknown)`,
      )
    }

    // Eagerly remove from `pending` so any concurrent/replay call throws.
    session.pending.delete(toolCallId)
    session.pendingPayloads.delete(toolCallId)
    session.last_active = new Date()
    if (session.pending.size === 0 && session.state === 'awaiting_mobile') {
      session.state = 'idle'
    }

    deferred.resolve(response)
  }

  /**
   * Clear a session's pending maps and return it to the `idle` state.
   * Does NOT delete the session from the store — use `delete` for that.
   */
  cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    for (const [toolCallId, deferred] of session.pending.entries()) {
      deferred.reject(new Error(`Session ${sessionId} cleaned up`))
      session.pending.delete(toolCallId)
    }
    session.pendingPayloads.clear()
    session.state = 'idle'
    session.last_active = new Date()
  }

  /**
   * Remove a session from the store entirely. Intended for tests and
   * explicit teardown; eviction goes through `evict`.
   */
  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.evict(session)
  }

  /**
   * Scan the store and evict any session whose `last_active` is older
   * than `SESSION_TTL_MS`. Exposed for background sweep wiring (task 05+)
   * and for tests.
   */
  sweep(): number {
    let evicted = 0
    for (const session of this.sessions.values()) {
      if (this.isExpired(session)) {
        this.evict(session)
        evicted++
      }
    }
    return evicted
  }

  /**
   * Test helper — number of sessions currently held in memory.
   * Does not perform eviction.
   */
  size(): number {
    return this.sessions.size
  }

  private isExpired(session: Session): boolean {
    return Date.now() - session.last_active.getTime() > SESSION_TTL_MS
  }

  private evict(session: Session): void {
    for (const deferred of session.pending.values()) {
      deferred.reject(new Error(`Session ${session.id} evicted`))
    }
    session.pending.clear()
    session.pendingPayloads.clear()
    this.sessions.delete(session.id)
  }
}
