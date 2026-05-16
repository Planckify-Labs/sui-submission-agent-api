import type { JsonSchemaProperty } from './types';

// ─── Reusable primitive schemas ──────────────────────────────────────────────

export const CHAIN_ID_PROP: JsonSchemaProperty = {
  type: 'integer',
  description:
    'EVM chain id the call targets. MUST be supplied for every multi-chain tool. Falls back to wallet_context.chain_id on the mobile during the v1.1 transition, but agents SHOULD always set this explicitly.',
  minimum: 1,
};

export const ADDRESS_PATTERN = '^0x[0-9a-fA-F]{40}$';

export const ADDRESS_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  pattern: ADDRESS_PATTERN,
  description,
});

export const WEI_AMOUNT_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  // Base-10 unsigned integer, bigint-safe. Matches protocol v1.1 §8
  // "BigInt on the wire" — all *_wei values are decimal strings.
  pattern: '^[0-9]+$',
  description,
});

export const TX_HASH_PROP: JsonSchemaProperty = {
  type: 'string',
  pattern: '^0x[0-9a-fA-F]{64}$',
  description: '32-byte transaction hash, 0x-prefixed hex.',
};

// ─── Solana primitives ────────────────────────────────────────────────────────

// Solana public keys / addresses are base58, 32-44 chars, excluding 0 O I l.
export const SOLANA_ADDRESS_PATTERN = '^[1-9A-HJ-NP-Za-km-z]{32,44}$';

export const SOLANA_ADDRESS_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  pattern: SOLANA_ADDRESS_PATTERN,
  description,
});

// ─── Sui primitives ──────────────────────────────────────────────────────────

// Sui addresses are 32-byte hex, 0x-prefixed (64 hex chars). The mobile kit
// uses `@mysten/sui` `isValidSuiAddress` which accepts exactly this form.
export const SUI_ADDRESS_PATTERN = '^0x[0-9a-fA-F]{64}$';

export const SUI_ADDRESS_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  pattern: SUI_ADDRESS_PATTERN,
  description,
});

// Sui Coin types follow the Move struct path `0x{addr}::{module}::{Name}`.
// e.g. `0x2::sui::SUI`. Same minimal sanity check the mobile executor uses;
// the BCS layer enforces the rest.
export const SUI_COIN_TYPE_PATTERN = '^0x[0-9a-fA-F]+::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*$';
