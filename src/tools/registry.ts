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
import { CORE_TOOLS } from './core';
import { DEFI_TOOLS } from './defi';
import { WALLET_TOOLS } from './wallet';

/**
 * Tool result shapes are **normative as of protocol v1.1** — see
 * `src/tools/result-shapes.ts` for the canonical `ToolResult.data` types and
 * `protocol-updates/protocol_v1.1.md` §6 / §8. Changes to any tool's result
 * shape require a protocol version bump.
 *
 * Composition layout (spec §7.1):
 *  - `tools/core/`   — orchestration affordances only (§4.1)
 *  - `tools/wallet/` — every existing on-device executor
 *  - `tools/defi/`   — v1 stubs matching `defi-strategies-spec.md` §11
 */
export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  ...CORE_TOOLS,
  ...WALLET_TOOLS,
  ...DEFI_TOOLS,
};
