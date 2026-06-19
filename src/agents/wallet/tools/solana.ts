import { composeAgentTools } from '../../../tools/internal/compose';
import { SOLANA_ADDRESS_PROP } from '../../../tools/internal/schemas';
import type { ToolMeta } from '../../../tools/internal/types';

export const WALLET_SOLANA_TOOLS: Record<string, ToolMeta> = composeAgentTools('wallet', {
  // ─── Mobile / blockchain_read — Solana native ─────────────────────────────
  // These are the Solana-namespaced siblings of `get_wallet_balance` /
  // `get_balance` / `send_native_token`. The agent picks between them by
  // reading `wallet_context.namespace`: `eip155` → EVM tools, `solana` →
  // these. No `chain_id` — the Solana cluster is carried on the session
  // via `wallet_context` and resolved by the mobile executor.
  get_wallet_sol_balance: {
    name: 'get_wallet_sol_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      "Read the connected mobile wallet's native SOL balance on the " +
      'active Solana cluster. Use this when wallet_context.namespace is ' +
      '"solana" — do NOT use get_wallet_balance (that is EVM-only).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_sol_balance: {
    name: 'get_sol_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      'Read the native SOL balance of an arbitrary Solana address on ' +
      'the active cluster. Use this when wallet_context.namespace is ' +
      '"solana". For EVM addresses use get_balance instead.',
    inputSchema: {
      type: 'object',
      properties: {
        address: SOLANA_ADDRESS_PROP(
          'Base58 Solana public key (32-44 chars). Defaults to the connected wallet address when omitted.',
        ),
      },
      required: [],
      additionalProperties: false,
    },
  },

  get_wallet_spl_tokens: {
    name: 'get_wallet_spl_tokens',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      'Return the supported SPL token list for the active Solana cluster, ' +
      'sourced from the backend token registry — the Solana counterpart to ' +
      'get_wallet_tokens (which is EVM-only). Each row carries symbol, name, ' +
      'mint address (contractAddress), decimals, is_native / is_stable_coin ' +
      'flags, optional pegged_currency, and (when `include_balance: true`) ' +
      'the live on-chain SPL token balance. Use this when ' +
      'wallet_context.namespace is "solana" to resolve a token symbol ' +
      '(e.g. "USDC", "USDT") to its mint address before calling send_spl_token, ' +
      'or to answer "what tokens do I hold on Solana?". Native SOL is included ' +
      'as a pseudo-row with is_native: true unless excluded. DO NOT report ' +
      'balance as zero when the result set is empty for a queried symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        include_balance: {
          type: 'boolean',
          description:
            'If true, resolve live on-chain balances for each SPL token ' +
            'via the Solana RPC. Balance fields (balance_lamports, balance_display) ' +
            'are omitted for tokens whose account lookup fails.',
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
            'If true, return only stablecoin SPL tokens (USDC, USDT, …). ' +
            'If false, return only non-stablecoin tokens. Omit to return all.',
        },
        is_native_currency: {
          type: 'boolean',
          description:
            'If true (default), include native SOL as the first row. ' +
            'If false, exclude it and return SPL-only tokens.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  // ─── Mobile / blockchain_write — Solana native ────────────────────────────
  send_sol: {
    name: 'send_sol',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Send native SOL from the connected mobile wallet to another ' +
      'Solana address. Use this when wallet_context.namespace is ' +
      '"solana"; for EVM native transfers use send_native_token instead. ' +
      'Provide `amount_sol` as a human-readable decimal string (e.g. ' +
      '"0.01"); the mobile converts to lamports internally. The user ' +
      'confirms the transfer on the mobile approval sheet before it is ' +
      'broadcast.',
    inputSchema: {
      type: 'object',
      properties: {
        to: SOLANA_ADDRESS_PROP('Recipient Solana address (base58 public key).'),
        amount_sol: {
          type: 'string',
          pattern: '^[0-9]+(\\.[0-9]+)?$',
          description:
            'Amount of SOL to send, as a decimal string. Must be greater than zero.',
        },
      },
      required: ['to', 'amount_sol'],
      additionalProperties: false,
    },
  },

  send_spl_token: {
    name: 'send_spl_token',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Transfer an SPL token (classic Token Program or Token-2022) from the ' +
      'connected mobile wallet to a recipient on Solana. Use this when ' +
      'wallet_context.namespace is "solana" and the user wants to send a ' +
      'non-native token — for native SOL use send_sol instead. ' +
      'ALWAYS obtain mint_address from get_wallet_spl_tokens — never guess it. ' +
      'Provide token_amount (human-readable, e.g. "10.5") and token_decimals ' +
      '(from get_wallet_spl_tokens, e.g. 6 for USDC) so the mobile can call ' +
      'parseUnits internally — do NOT compute raw amounts yourself. ' +
      'The kit auto-detects whether the mint belongs to the classic Token ' +
      'Program or Token-2022 so no program discriminator is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        to: SOLANA_ADDRESS_PROP('Recipient Solana address (base58 public key).'),
        mint_address: SOLANA_ADDRESS_PROP(
          'SPL token mint address (base58) from get_wallet_spl_tokens.',
        ),
        token_amount: {
          type: 'string',
          pattern: '^[0-9]+(\\.[0-9]+)?$',
          description:
            'Human-readable transfer amount, e.g. "10.5". ' +
            'The mobile calls parseUnits(token_amount, token_decimals) internally.',
        },
        token_decimals: {
          type: 'integer',
          description:
            'Decimal places for this token (from get_wallet_spl_tokens). ' +
            'e.g. 6 for USDC, 9 for most SPL tokens.',
          minimum: 0,
        },
      },
      required: ['to', 'mint_address', 'token_amount', 'token_decimals'],
      additionalProperties: false,
    },
  },

  // ─── Mobile / blockchain_write — Solana TakumiPay ───────────────────────
  execute_booking_sol: {
    name: 'execute_booking_sol',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Submit a product purchase transaction on the TakumiPay Solana program ' +
      '(createTransactionSol/Token). Use this when wallet_context.namespace is ' +
      '"solana" and the user wants to pay for a product/booking — for EVM use ' +
      'execute_booking instead.',
    inputSchema: {
      type: 'object',
      properties: {
        booking_id: {
          type: 'string',
          description: 'Booking UUID from the backend.',
        },
        exchange_rate_id: {
          type: 'string',
          description: 'Exchange rate ID from the backend.',
        },
        product_variant_id: {
          type: 'string',
          description: 'Product variant UUID.',
        },
        ref_id: {
          type: 'string',
          description: 'Unique reference ID for idempotency.',
        },
        amount: {
          type: 'string',
          description: 'Amount in token minor units (decimal string).',
        },
        token_mint: SOLANA_ADDRESS_PROP(
          'SPL token mint address (base58). Omit for native SOL.',
        ),
      },
      required: ['booking_id', 'exchange_rate_id', 'product_variant_id', 'ref_id', 'amount'],
      additionalProperties: false,
    },
  },
  deposit_points_sol: {
    name: 'deposit_points_sol',
    category: 'points',
    executor: 'mobile',
    capability: 'write',
    description:
      'Deposit SPL tokens into the TakumiPay Solana program to earn points. ' +
      'Use this when wallet_context.namespace is "solana" — for EVM use ' +
      'deposit_points instead. ALWAYS call get_points_price first.',
    inputSchema: {
      type: 'object',
      properties: {
        token_mint: SOLANA_ADDRESS_PROP('SPL token mint address (base58).'),
        token_amount: {
          type: 'string',
          description:
            'Human-readable token amount (e.g. "100"). NOT lamports.',
        },
        expected_points: {
          type: 'string',
          description:
            'Expected points from get_points_price, shown in approval summary.',
        },
      },
      required: ['token_mint', 'token_amount', 'expected_points'],
      additionalProperties: false,
    },
  },
});
