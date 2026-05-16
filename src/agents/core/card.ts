/**
 * Core agent — orchestration-only, NO external tools.
 *
 * Spec reference: docs/multi-agent-architecture-spec.md §4.1, §5.
 *
 * Hard invariant (§4.1): `tool_prefixes` is exactly `["core_"]` and
 * never grows. Enforced by `assertRegistryInvariants` at boot and by
 * `pnpm check:agents` in CI. Anything Core needs from outside its
 * sandbox goes through a specialist's tool prefix — never through Core.
 *
 * Handler + prompts land in Task 10.
 */

import type { AgentCard } from '../types'

export const coreCard: AgentCard = {
  id: 'core',
  version: '0.1.0',
  display_name: 'Takumi',
  description:
    'Routes the user request to the right specialist and summarises the result back.',
  tool_prefixes: ['core_'],
  capabilities: ['route', 'clarify', 'narrate'],
  requires_wallet_context: true,
  requires_jwt: true,
  default_system_prompt_ref: 'core.v1',
  status: 'ready',
}
