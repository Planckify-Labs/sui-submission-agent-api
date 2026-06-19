/**
 * Central Tool Registry — single source of truth for tool classification.
 *
 * Drives:
 *  - Server agent loop routing (`executor: "server"` vs `"mobile"`)
 *  - Mobile SDK defaults for unknown writes (`capability: "write"` → confirm)
 *
 * Rules (non-negotiable):
 *  - Onchain = mobile, non-onchain = server. No exceptions.
 *  - `capability` is factual (what the tool does), never a UX sensitivity.
 *    UX is decided client-side by `ApprovalPolicy`.
 *
 * Protocol reference: AGENT_PROTOCOL.md §5 "Tool Classification (Central Registry)".
 *
 * Pure data module — no side effects, no blockchain imports.
 */

export type {
  JsonSchemaObject,
  JsonSchemaProperty,
  ToolCapability,
  ToolCategory,
  ToolExecutor,
  ToolMeta,
} from './internal/types';

import type { ToolMeta } from './internal/types';
// Tool DEFINITIONS are co-located with the agent that owns them
// (src/agents/<id>/tools). This module only re-assembles the union into
// `TOOL_REGISTRY` — the exported names are unchanged, so the mobile
// registry-parity check is unaffected.
import { CORE_TOOLS } from '../agents/core/tools';
import { DEFI_TOOLS } from '../agents/defi/tools';
import { WALLET_TOOLS } from '../agents/wallet/tools';

/**
 * Tool result shapes are **normative as of protocol v1.1** — see
 * `src/tools/result-shapes.ts` for the canonical `ToolResult.data` types and
 * `protocol-updates/protocol_v1.1.md` §6 / §8. Changes to any tool's result
 * shape require a protocol version bump.
 *
 * Composition layout (co-located with each owning agent):
 *  - `agents/core/tools/`   — orchestration affordances only (§4.1)
 *  - `agents/wallet/tools/` — every on-device executor
 *  - `agents/defi/tools/`   — DeFi + Sui Intent Engine tools
 */
export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  ...CORE_TOOLS,
  ...WALLET_TOOLS,
  ...DEFI_TOOLS,
};
