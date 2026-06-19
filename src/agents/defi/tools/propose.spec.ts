/**
 * Schema-contract tests for the DeFi write tools.
 *
 * Regression guard: the `defi_rebalance` tool schema MUST stay in lock
 * step with what the mobile executor consumes
 * (`mobile-app/services/agent-executors/defi/writes.ts`). The two had
 * drifted — the server advertised `position_id` / `target_protocol_slug`
 * while the executor read `from_position_id` / `to_protocol_slug` /
 * `to_asset_symbol`, so every rebalance failed with
 * `missing_or_invalid_from_position_id`. These tests pin the contract.
 */

import { DEFI_PROPOSE_TOOLS } from './propose';

type JsonSchema = {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

describe('DEFI_PROPOSE_TOOLS schema contract', () => {
  describe('defi_rebalance', () => {
    const tool = DEFI_PROPOSE_TOOLS.defi_rebalance;
    const schema = tool.inputSchema as JsonSchema;

    it('is a mobile-executed write tool', () => {
      expect(tool.executor).toBe('mobile');
      expect(tool.capability).toBe('write');
    });

    it('requires exactly the fields the mobile executor reads', () => {
      expect(schema.required).toEqual([
        'from_position_id',
        'to_protocol_slug',
        'to_asset_symbol',
      ]);
    });

    it('exposes the optional executor fields', () => {
      for (const key of [
        'from_position_id',
        'to_protocol_slug',
        'to_asset_symbol',
        'to_asset_contract',
        'to_amount_raw',
        'expected_apy',
      ]) {
        expect(schema.properties).toHaveProperty(key);
      }
    });

    it('does NOT carry the stale field names that caused the drift', () => {
      expect(schema.properties).not.toHaveProperty('position_id');
      expect(schema.properties).not.toHaveProperty('target_protocol_slug');
    });

    it('rejects unknown fields (additionalProperties: false)', () => {
      expect(schema.additionalProperties).toBe(false);
    });
  });
});
