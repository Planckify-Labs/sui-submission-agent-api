import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Logging-policy guard test — see protocol_v1.1.md §14 Guard F.
 *
 * Scans every non-test source file in `src/` and fails if a logger call
 * (console.*, this.logger.*, Logger.*) is passed a known session-sensitive
 * token. This is a cheap grep-style check, not a full AST scan — it catches
 * the shape of the footguns documented in Task 14.
 *
 * Banned tokens inside a logger call argument list:
 *   - session.messages
 *   - wallet_context
 *   - request.body / req.body
 *   - request.headers / req.headers
 *   - tc.input (tool call args)
 *   - rawResult (tool call result payload)
 *
 * If you need to add a new logger call, log only:
 *   - session_id
 *   - tool_name / event_type
 *   - status + timing
 *   - error.message / stack traces
 */
describe('logging policy (protocol_v1.1.md §14-F)', () => {
  const srcRoot = join(__dirname, '..')

  const BANNED_TOKENS = [
    'session.messages',
    'wallet_context',
    'request.body',
    'req.body',
    'request.headers',
    'req.headers',
    'tc.input',
    'rawResult',
  ]

  // Matches `console.log(...)`, `this.logger.warn(...)`, `Logger.error(...)`.
  // Captures the argument list up to the next closing paren on the same
  // line (good enough for the single-line logger calls used in this repo).
  const LOGGER_CALL =
    /(?:console\.(?:log|debug|info|warn|error)|(?:this\.)?logger\.(?:log|debug|info|warn|error)|Logger\.(?:log|debug|info|warn|error))\s*\(([^\n)]*)/g

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        out.push(...walk(full))
      } else if (
        stat.isFile() &&
        full.endsWith('.ts') &&
        !full.endsWith('.spec.ts') &&
        !full.endsWith('.d.ts')
      ) {
        out.push(full)
      }
    }
    return out
  }

  const files = walk(srcRoot)

  it('discovers source files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('logger calls never reference session-sensitive payloads', () => {
    const violations: string[] = []

    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const matches = line.matchAll(LOGGER_CALL)
        for (const match of matches) {
          const args = match[1] ?? ''
          for (const token of BANNED_TOKENS) {
            if (args.includes(token)) {
              violations.push(
                `${file}:${i + 1} logger call includes banned token "${token}": ${line.trim()}`,
              )
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Logging policy violations (protocol_v1.1.md §14-F):\n${violations.join('\n')}`,
      )
    }
  })
})
