/**
 * x402 resource catalog (x402-extensibility-spec Part I).
 *
 * Replaces the single hardcoded use case (`X402_SECURITY_AUDIT_URL` wired
 * through a bespoke prompt block, the `chat.service` URL pin-hack, and the
 * `main.ts` boot log) with a declarative registry of paid resources. The
 * agent picks a *capability* (`resource` id) from a closed set; the server
 * resolves the URL (CI-1/CI-2). Adding a resource = a catalog row, not a
 * code edit (G1).
 *
 * Source of truth (G5): a DB-backed table (Valkey-cached), warmed into an
 * in-memory snapshot by `refreshCatalog()`. Env vars are a local-dev
 * seed/override only. Reads are SYNCHRONOUS off the warm snapshot so the
 * (synchronous) prompt builder + tool-schema builder need no async
 * threading; the snapshot is never empty (env seed runs at import).
 *
 * Provider-neutral by construction (CI-1): a resource URL lives ONLY in
 * its row — never written in code.
 */

/** The declarative semantics of a paid resource (no host literal). */
export interface X402Resource {
  /** Stable key; also the `x402_fetch` enum value. */
  id: string
  /** User-neutral family name, e.g. "security audit". */
  label: string
  method?: 'GET' | 'POST'
  /** Prompt material (§7): what it knows that the free tools don't. */
  purpose: string
  /** Trigger conditions, rendered as bullets in the prompt. */
  useWhen: string[]
  /** → per-call `maxSpendUsdc` ceiling hint (CI-4). */
  expectedMaxUsdc?: number
  /** Turn the tool's domain args into a concrete request. */
  buildRequest?(params: Record<string, unknown>): {
    path?: string
    query?: Record<string, string>
    body?: unknown
  }
}

/** A resolved entry: catalog semantics + the URL/enablement from the store. */
export interface X402ResourceRecord extends X402Resource {
  /** Resolved endpoint (DB row / env) — NEVER hardcoded in code (CI-1). */
  url: string
  enabled: boolean
  /** Ordering when several resources could match a query. */
  priority: number
}

/**
 * A store-shaped row (URL + flags + the prompt/semantic fields). The DB
 * loader and the env seed both emit this shape; `buildRequest` is attached
 * by id from {@link REQUEST_BUILDERS} so behaviour can live in code while
 * the row stays pure data.
 */
export interface X402ResourceRow {
  id: string
  label: string
  url: string
  method?: 'GET' | 'POST'
  purpose: string
  useWhen: string[]
  expectedMaxUsdc?: number
  enabled: boolean
  priority: number
}

/**
 * Per-id request shapers, kept in code (a row is pure data). A resource
 * with no builder sends the base URL verbatim — backward-compatible with
 * the pre-catalog `x402_fetch({ url })` behaviour when no `params` are
 * passed.
 */
const REQUEST_BUILDERS: Record<string, X402Resource['buildRequest']> = {
  'security-audit': (params) => {
    const protocol =
      typeof params.protocol === 'string' ? params.protocol : undefined
    return protocol ? { query: { protocol } } : {}
  },
}

/**
 * In-memory snapshot — the synchronous source for the prompt builder + tool
 * schema. Starts EMPTY and is warmed from the DB by `refreshCatalog` (the
 * Nest layer calls it at boot). Purely DB/API-driven: NO env var is read at
 * runtime — the catalog is exactly what the `X402Resource` table holds. The
 * `X402_SECURITY_AUDIT_URL` env var is consumed ONLY by the one-time seed
 * script (`prisma/seed.ts`) that inserts the row.
 */
let SNAPSHOT: X402ResourceRecord[] = []

function toRecord(row: X402ResourceRow): X402ResourceRecord {
  return { ...row, buildRequest: REQUEST_BUILDERS[row.id] }
}

/** Replace the snapshot (used by the DB refresh + tests). */
function setSnapshot(rows: X402ResourceRow[]): void {
  SNAPSHOT = rows.map(toRecord)
}

/** A DB/remote loader. Injected by the Nest layer so this module stays
 * Prisma-free and unit-testable. Returns the authoritative rows. */
export type CatalogLoader = () => Promise<X402ResourceRow[]>

/**
 * Refresh the snapshot from the authoritative store (the DB). Best-effort:
 * a loader failure keeps the last-good snapshot so a transient DB blip never
 * empties the catalog. An empty table legitimately yields an empty catalog
 * (the agent then exposes no x402 capability) — there is NO env fallback;
 * seed the table via `prisma/seed.ts`. Call at boot and on a TTL; the Valkey
 * cache lives inside the injected loader.
 */
export async function refreshCatalog(loader: CatalogLoader): Promise<void> {
  try {
    setSnapshot(await loader())
  } catch {
    // Keep the existing snapshot — never throw into the request path.
  }
}

/** Test-only: force the snapshot (bypasses env/DB). */
export function __setSnapshotForTests(rows: X402ResourceRow[]): void {
  setSnapshot(rows)
}

// ── Reads (synchronous, off the warm snapshot) ──────────────────────────

/** Enabled, resolvable resources, priority-ordered (CI-3). */
export function enabledResources(): X402ResourceRecord[] {
  return SNAPSHOT.filter((r) => r.enabled && !!r.url).sort(
    (a, b) => a.priority - b.priority,
  )
}

/** Enabled resource ids → the `x402_fetch` enum (CI-3). */
export function enabledResourceIds(): string[] {
  return enabledResources().map((r) => r.id)
}

/** Resolve one enabled resource by id; `undefined` if absent/disabled. */
export function getResource(id: string): X402ResourceRecord | undefined {
  return enabledResources().find((r) => r.id === id)
}

// ── URL composition + tool-input resolution ─────────────────────────────

/** Compose a concrete URL from a base + optional path + query (CI-2). */
export function composeUrl(
  base: string,
  path?: string,
  query?: Record<string, string>,
): string {
  let url = base
  if (path) url = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  const entries = Object.entries(query ?? {})
  if (entries.length > 0) {
    const qs = new URLSearchParams(entries).toString()
    url += (url.includes('?') ? '&' : '?') + qs
  }
  return url
}

/** The resolved request the mobile `x402_fetch` executor expects (N2). */
export interface ResolvedX402Request {
  url: string
  method?: 'GET' | 'POST'
  maxSpendUsdc?: number
  body?: unknown
}

/**
 * Resolve a chosen capability (`resourceId` + domain `params`) into the
 * concrete request injected into the mobile tool input. The model NEVER
 * typed a URL (CI-2). Returns `undefined` for an unknown/disabled id so the
 * caller can surface friendly copy without echoing the raw id (CI-5).
 */
export function resolveResourceRequest(
  resourceId: string,
  params: Record<string, unknown> = {},
  maxSpendUsdcOverride?: number,
): ResolvedX402Request | undefined {
  const res = getResource(resourceId)
  if (!res) return undefined
  const { path, query, body } = res.buildRequest?.(params) ?? {}
  return {
    url: composeUrl(res.url, path, query),
    method: res.method,
    maxSpendUsdc: maxSpendUsdcOverride ?? res.expectedMaxUsdc, // CI-4
    ...(body !== undefined ? { body } : {}),
  }
}
