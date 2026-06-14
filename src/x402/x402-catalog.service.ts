import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ValkeyService } from '../valkey/valkey.service'
import {
  type CatalogLoader,
  refreshCatalog,
  type X402ResourceRow,
} from './catalog'

/**
 * Warms the x402 resource catalog (x402-extensibility-spec Part I §5.2,
 * G5) from the DB into the in-memory snapshot the prompt builder + tool
 * schema read synchronously.
 *
 * Source of truth: the `x402_resources` table, Valkey-cached. NO env var
 * is read at runtime — `X402_SECURITY_AUDIT_URL` is consumed only by the
 * one-time seed (`prisma/seed.ts` / `pnpm seed:x402`). Updating a row in
 * the DB propagates without a deploy — on the next boot or within the
 * cache TTL — so the catalog is fully API/data-driven (CI-1, G1): adding a
 * resource is one row, no code.
 *
 * Best-effort by construction: a DB/Valkey outage leaves the last-good
 * snapshot in place; the catalog is never abruptly emptied and no error
 * reaches the request path.
 */
const CACHE_KEY = 'takumi:x402:catalog'
const CACHE_TTL_S = 300

@Injectable()
export class X402CatalogService implements OnModuleInit {
  private readonly logger = new Logger(X402CatalogService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly valkey: ValkeyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh()
  }

  /** Reload the snapshot from the DB (Valkey-cached, env fallback). */
  async refresh(): Promise<void> {
    await refreshCatalog(this.loadRows)
    this.logger.log('x402 catalog warmed')
  }

  /** Force a cache-bypassing reload (e.g. after an admin edit). */
  async invalidate(): Promise<void> {
    await this.valkey.del(CACHE_KEY).catch(() => undefined)
    await this.refresh()
  }

  private readonly loadRows: CatalogLoader = async () => {
    const cached = await this.valkey.get(CACHE_KEY).catch(() => null)
    if (cached) {
      try {
        return JSON.parse(cached) as X402ResourceRow[]
      } catch {
        // Corrupt cache — fall through to a fresh DB read.
      }
    }

    const rows = await this.prisma.x402Resource.findMany({
      orderBy: { priority: 'asc' },
    })
    const mapped: X402ResourceRow[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      url: r.url,
      method: r.method === 'POST' ? 'POST' : 'GET',
      purpose: r.purpose,
      useWhen: r.useWhen,
      expectedMaxUsdc:
        r.expectedMaxUsdc != null ? Number(r.expectedMaxUsdc) : undefined,
      enabled: r.enabled,
      priority: r.priority,
    }))

    await this.valkey
      .setex(CACHE_KEY, CACHE_TTL_S, JSON.stringify(mapped))
      .catch(() => undefined)
    return mapped
  }
}
