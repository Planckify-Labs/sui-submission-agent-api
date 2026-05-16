import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ToolMeta } from './types';

interface AgentManifestEntry {
  id: string;
  display_name: string;
  tool_prefixes: string[];
  status: string;
}

interface AgentManifestFile {
  version: number;
  agents: AgentManifestEntry[];
}

/**
 * Validate that every tool name in `tools` matches at least one of the
 * declared `tool_prefixes` of the given agent in
 * `agents/manifests/agentManifests.json`.
 *
 * Manifest entries ending in `_` match as a prefix family (e.g. `get_`
 * matches `get_balance`, `get_wallet_balance`, …). Entries without a
 * trailing underscore match as an exact tool name (e.g. `read_contract`).
 *
 * Throws on mismatch; returns `tools` unchanged on success.
 */
export function composeAgentTools(
  agentId: string,
  tools: Record<string, ToolMeta>,
): Record<string, ToolMeta> {
  const manifestPath = resolve(
    __dirname,
    '../../agents/manifests/agentManifests.json',
  );
  const raw = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as AgentManifestFile;

  const agent = manifest.agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(
      `[tools/compose] agent "${agentId}" not found in agentManifests.json`,
    );
  }

  const prefixes = agent.tool_prefixes;

  for (const name of Object.keys(tools)) {
    const matches = prefixes.some((p) => {
      if (p.endsWith('_')) {
        return name.startsWith(p);
      }
      return name === p;
    });
    if (!matches) {
      throw new Error(
        `[tools/compose] tool "${name}" does not match any prefix of agent "${agentId}" (prefixes: ${prefixes.join(', ')})`,
      );
    }
  }

  return tools;
}
