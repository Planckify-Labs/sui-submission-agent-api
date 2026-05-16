#!/usr/bin/env node
/**
 * sync-agent-manifests — copy the server-authoritative agent manifest
 * to the mobile mirror so prefix routing stays in lockstep.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §5, §7.3, §10.4.
 *
 * Rules:
 *  - Server (this package) is the source of truth.
 *  - Mobile never edits its mirror by hand.
 *  - Errors loudly if the destination is missing (sync, do not create).
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SOURCE = resolve(__dirname, '../src/agents/manifests/agentManifests.json')
const DEST = resolve(
  __dirname,
  '../../mobile-app/services/agent-executors/agentManifests.json',
)

function fail(message) {
  console.error(`[manifests:sync] ${message}`)
  process.exit(1)
}

if (!existsSync(SOURCE)) {
  fail(`source manifest missing at ${SOURCE}`)
}

if (!existsSync(DEST)) {
  fail(
    `destination mirror missing at ${DEST} — create the file once, then re-run`,
  )
}

// Validate JSON before writing so we never propagate a corrupt mirror.
const sourceText = readFileSync(SOURCE, 'utf8')
try {
  JSON.parse(sourceText)
} catch (err) {
  fail(`source manifest is not valid JSON: ${err instanceof Error ? err.message : 'unknown'}`)
}

const destText = existsSync(DEST) ? readFileSync(DEST, 'utf8') : null
if (destText === sourceText) {
  console.log('[manifests:sync] already in sync — no changes')
  process.exit(0)
}

writeFileSync(DEST, sourceText)
console.log(`[manifests:sync] wrote ${DEST}`)
