/**
 * x402 resource catalog seed (x402-extensibility-spec Part I §5.2).
 *
 * This is the ONLY place `X402_SECURITY_AUDIT_URL` is consumed — it seeds
 * the canonical `security-audit` row into the `X402Resource` table. At
 * runtime the catalog reads exclusively from the DB (no env), so the agent
 * is fully API/DB-driven. Run once after migrating:
 *
 *   pnpm seed:x402
 *
 * Idempotent: re-running upserts the row (refreshing the URL) without
 * clobbering an operator's `enabled`/`priority` edits made via the DB.
 * Adding more resources = inserting more rows (a DB/admin task, no code).
 */

import fs from 'node:fs'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma'

// Load .env when present (matches prisma.config.ts; not in Docker prod).
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

/** Canonical security-audit row — semantics live here (the seed), the URL
 *  comes from env. Was the old in-code `seedFromEnv()` block. */
function securityAuditSeed(url: string) {
  return {
    id: 'security-audit',
    label: 'security audit',
    method: 'GET',
    purpose:
      'the free DeFi listing only knows APY, TVL and a coarse risk badge. ' +
      "It does NOT know a protocol's audit status, audit firm/date, " +
      'contract-verification, admin-key control, or exploit/incident ' +
      'history. The security report is the only source for those.',
    useWhen: [
      '"has <protocol> ever been hacked/exploited?", "what\'s its security track record?"',
      '"is <protocol> audited? by whom? when?"',
      '"who controls <protocol>? are the admin keys a timelock/multisig or an EOA?"',
      'as due diligence BEFORE recommending or executing a deposit or a "rebalance into the safest" pool',
    ],
    expectedMaxUsdc: 0.5,
    enabled: true,
    priority: 100,
    url,
  }
}

async function main(): Promise<void> {
  const url = process.env.X402_SECURITY_AUDIT_URL
  if (!url) {
    console.log('[seed:x402] X402_SECURITY_AUDIT_URL unset — nothing to seed')
    return
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({
    adapter,
  } as ConstructorParameters<typeof PrismaClient>[0])

  try {
    const row = securityAuditSeed(url)
    await prisma.x402Resource.upsert({
      where: { id: row.id },
      // Only refresh the URL on re-seed — leave enabled/priority/copy to
      // whatever the operator has tuned in the DB.
      update: { url: row.url },
      create: row,
    })
    console.log(`[seed:x402] upserted "${row.id}" → ${row.url}`)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[seed:x402] failed:', err)
  process.exit(1)
})
