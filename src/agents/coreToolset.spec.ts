import { buildAllTools, buildSchemaToolSet } from '../chat.service'
import { CORE_TOOLS } from './core/tools'

/**
 * Regression for "Core printed core_handoff(...) as TEXT instead of calling
 * it". Root cause: `core_handoff` / `core_clarify` are `executor: "server"`
 * affordances with no MCP binding, so `buildAllTools` SKIPPED them — the
 * model got an empty tool set and described the call as prose. Core must use
 * the schema-only builder so the affordances are actually callable.
 */
describe('Core router tool set', () => {
  it('buildSchemaToolSet exposes core_handoff + core_clarify to the model', () => {
    const set = buildSchemaToolSet(CORE_TOOLS)
    expect(Object.keys(set)).toEqual(
      expect.arrayContaining(['core_handoff', 'core_clarify']),
    )
  })

  it('documents why: buildAllTools DROPS the server-executor affordances', () => {
    const set = buildAllTools(CORE_TOOLS, {})
    expect(set.core_handoff).toBeUndefined()
    expect(set.core_clarify).toBeUndefined()
  })
})
