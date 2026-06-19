import { composeAgentTools } from '../../../tools/internal/compose';
import { SUI_ADDRESS_PROP, SUI_COIN_TYPE_PATTERN } from '../../../tools/internal/schemas';
import type { ToolMeta } from '../../../tools/internal/types';

export const WALLET_SUI_TOOLS: Record<string, ToolMeta> = composeAgentTools('wallet', {
  // ─── Mobile / blockchain_read — Sui native ────────────────────────────────
  // Sui-namespaced siblings of `get_wallet_balance` / `get_balance` /
  // `send_native_token`. Picked when `wallet_context.namespace === "sui"`.
  // Like Solana there is no `chain_id` — the Sui network (mainnet / testnet /
  // devnet) is carried on the session via `wallet_context` and resolved by
  // the mobile executor from the persisted active chain. Sui transaction
  // identifiers are base58 digests, not 0x-hex hashes — write tools surface
  // the digest in `data.digest` rather than the wire-typed `tx_hash` slot.
  get_wallet_sui_balance: {
    name: 'get_wallet_sui_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      "Read the connected mobile wallet's native SUI balance on the " +
      'active Sui network. Use this when wallet_context.namespace is ' +
      '"sui" — do NOT use get_wallet_balance (EVM-only) or ' +
      'get_wallet_sol_balance (Solana-only).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_sui_balance: {
    name: 'get_sui_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      'Read the native SUI balance of an arbitrary Sui address on the ' +
      'active network. Use this when wallet_context.namespace is "sui". ' +
      'For EVM addresses use get_balance, for Solana use get_sol_balance.',
    inputSchema: {
      type: 'object',
      properties: {
        address: SUI_ADDRESS_PROP(
          '32-byte Sui address (0x-prefixed, 64 hex chars). Defaults to the connected wallet address when omitted.',
        ),
      },
      required: [],
      additionalProperties: false,
    },
  },

  get_wallet_sui_coins: {
    name: 'get_wallet_sui_coins',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      'Return the supported Sui Coin<T> token list for the active Sui ' +
      'network, sourced from the backend token registry — the Sui ' +
      'counterpart to get_wallet_tokens (EVM-only) and get_wallet_spl_tokens ' +
      '(Solana-only). Each row carries symbol, name, address (the Move ' +
      "struct path `0x{addr}::{module}::{Name}` — Sui's coin type identifier), " +
      'decimals, is_native / is_stable_coin flags, optional pegged_currency, ' +
      'and (when `include_balance: true`) the live on-chain coin balance. ' +
      'Use this when wallet_context.namespace is "sui" to resolve a token ' +
      'symbol (e.g. "USDC") to its coin type before calling send_sui_coin ' +
      '(pass the row\'s `address` as `coin_type`), or to answer "what tokens ' +
      'do I hold on Sui?". Native SUI is included as a pseudo-row with ' +
      'is_native: true unless excluded. DO NOT report balance as zero when ' +
      'the result set is empty for a queried symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        include_balance: {
          type: 'boolean',
          description:
            'If true, resolve live on-chain balances for each coin via the ' +
            'Sui RPC `getAllBalances` call. Balance fields ' +
            '(`balance_mist`, `balance_display`) are omitted for tokens ' +
            'whose lookup fails.',
        },
        symbol: {
          type: 'string',
          description:
            'Optional filter: only return tokens whose symbol matches ' +
            '(case-insensitive prefix or exact match).',
        },
        is_stable_coin: {
          type: 'boolean',
          description:
            'If true, return only stablecoin Sui coins. If false, return ' +
            'only non-stablecoin coins. Omit to return all.',
        },
        is_native_currency: {
          type: 'boolean',
          description:
            'If true (default), include native SUI as the first row. ' +
            'If false, exclude it and return Coin<T>-only tokens.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  // ─── Mobile / blockchain_write — Sui native ───────────────────────────────
  send_sui: {
    name: 'send_sui',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Send native SUI from the connected mobile wallet to another Sui ' +
      'address. Use this when wallet_context.namespace is "sui"; for EVM ' +
      'native transfers use send_native_token, for Solana use send_sol. ' +
      'Provide `amount_sui` as a human-readable decimal string (e.g. ' +
      '"0.1"); the mobile converts to MIST (1 SUI = 1e9 MIST) internally. ' +
      'The user confirms the transfer on the mobile approval sheet before ' +
      'it is broadcast. Note: the resulting transaction digest is base58 ' +
      'and is returned in `data.digest`, not in `tx_hash`.',
    inputSchema: {
      type: 'object',
      properties: {
        to: SUI_ADDRESS_PROP('Recipient Sui address (0x-prefixed 32-byte hex).'),
        amount_sui: {
          type: 'string',
          pattern: '^[0-9]+(\\.[0-9]+)?$',
          description:
            'Amount of SUI to send, as a decimal string. Must be greater than zero.',
        },
      },
      required: ['to', 'amount_sui'],
      additionalProperties: false,
    },
  },

  send_sui_coin: {
    name: 'send_sui_coin',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Transfer a non-native Sui Coin<T> (regulated, closed-loop, or plain) ' +
      'from the connected mobile wallet to a recipient. Use this when ' +
      'wallet_context.namespace is "sui" and the user wants to send a ' +
      'non-native token — for native SUI use send_sui instead. ' +
      'ALWAYS obtain coin_type from get_wallet_sui_coins — never guess it. ' +
      'Provide token_amount (human-readable, e.g. "1.5") and token_decimals ' +
      '(from get_wallet_sui_coins) so the mobile can call parseUnits ' +
      'internally — do NOT compute raw amounts yourself. The kit handles ' +
      'per-coin-kind branching (regulated / closed-loop / plain) so no ' +
      'discriminator is needed. Note: the resulting transaction digest is ' +
      'base58 and is returned in `data.digest`, not in `tx_hash`.',
    inputSchema: {
      type: 'object',
      properties: {
        to: SUI_ADDRESS_PROP('Recipient Sui address (0x-prefixed 32-byte hex).'),
        coin_type: {
          type: 'string',
          pattern: SUI_COIN_TYPE_PATTERN,
          description:
            'Sui Coin<T> type identifier (Move struct path `0x{addr}::{module}::{Name}`) ' +
            'from get_wallet_sui_coins. e.g. `0x5d4b…::usdc::USDC`.',
        },
        token_amount: {
          type: 'string',
          pattern: '^[0-9]+(\\.[0-9]+)?$',
          description:
            'Human-readable transfer amount, e.g. "1.5". ' +
            'The mobile calls parseUnits(token_amount, token_decimals) internally.',
        },
        token_decimals: {
          type: 'integer',
          description:
            'Decimal places for this coin (from get_wallet_sui_coins). ' +
            'e.g. 6 for USDC, 9 for native-style coins.',
          minimum: 0,
        },
      },
      required: ['to', 'coin_type', 'token_amount', 'token_decimals'],
      additionalProperties: false,
    },
  },
});
