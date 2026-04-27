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

export type ToolExecutor = 'server' | 'mobile';
export type ToolCapability = 'read' | 'simulate' | 'write';
export type ToolCategory =
  | 'blockchain_read'
  | 'blockchain_write'
  | 'points'
  | 'utility';

/**
 * Minimal JSON-Schema shape used for mobile tool input descriptions.
 *
 * This is a subset of Draft-07 and purposefully typed loosely so the
 * per-tool schemas below read like plain JSON. `buildAllTools` in
 * `chat.service.ts` wraps these in the `ai` SDK's `jsonSchema()` helper
 * before passing them to the LLM.
 */
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  pattern?: string;
  enum?: Array<string | number>;
  minimum?: number;
  items?: JsonSchemaProperty | { type: string };
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | { type: string };
  oneOf?: JsonSchemaProperty[];
}

export interface ToolMeta {
  name: string;
  category: ToolCategory;
  executor: ToolExecutor;
  capability: ToolCapability;
  description: string;
  /**
   * Concrete JSON Schema for this tool's input. Required for every
   * mobile tool per protocol v1.1 §3 — the LLM has no other signal
   * about which parameters are mandatory. Server-executor tools may
   * omit this because the MCP client publishes its own schemas.
   */
  inputSchema?: JsonSchemaObject;
}

// ─── Reusable primitive schemas ──────────────────────────────────────────────

const CHAIN_ID_PROP: JsonSchemaProperty = {
  type: 'integer',
  description:
    'EVM chain id the call targets. MUST be supplied for every multi-chain tool. Falls back to wallet_context.chain_id on the mobile during the v1.1 transition, but agents SHOULD always set this explicitly.',
  minimum: 1,
};

const ADDRESS_PATTERN = '^0x[0-9a-fA-F]{40}$';

const ADDRESS_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  pattern: ADDRESS_PATTERN,
  description,
});

const WEI_AMOUNT_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  // Base-10 unsigned integer, bigint-safe. Matches protocol v1.1 §8
  // "BigInt on the wire" — all *_wei values are decimal strings.
  pattern: '^[0-9]+$',
  description,
});

const TX_HASH_PROP: JsonSchemaProperty = {
  type: 'string',
  pattern: '^0x[0-9a-fA-F]{64}$',
  description: '32-byte transaction hash, 0x-prefixed hex.',
};

// ─── Solana primitives ────────────────────────────────────────────────────────

// Solana public keys / addresses are base58, 32-44 chars, excluding 0 O I l.
const SOLANA_ADDRESS_PATTERN = '^[1-9A-HJ-NP-Za-km-z]{32,44}$';

const SOLANA_ADDRESS_PROP = (description: string): JsonSchemaProperty => ({
  type: 'string',
  pattern: SOLANA_ADDRESS_PATTERN,
  description,
});

/**
 * Tool result shapes are **normative as of protocol v1.1** — see
 * `src/tools/result-shapes.ts` for the canonical `ToolResult.data` types and
 * `protocol-updates/protocol_v1.1.md` §6 / §8. Changes to any tool's result
 * shape require a protocol version bump.
 */
export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  // ─── Mobile / blockchain_read — capability `read` ───────────────────────────
  get_balance: {
    name: 'get_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Read the native token balance of an address on a given chain.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        address: ADDRESS_PROP(
          'Address to look up. Defaults to the connected wallet address if omitted.',
        ),
      },
      required: ['chain_id'],
      additionalProperties: false,
    },
  },
  get_wallet_balance: {
    name: 'get_wallet_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: "Read the connected mobile wallet's native token balance.",
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
      },
      required: ['chain_id'],
      additionalProperties: false,
    },
  },
  read_contract: {
    name: 'read_contract',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Call a read-only (view/pure) function on a smart contract.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        contract_address: ADDRESS_PROP(
          'Address of the smart contract to read from.',
        ),
        function_name: {
          type: 'string',
          description:
            'Name of the view/pure function to call (e.g. "balanceOf", "symbol").',
        },
        args: {
          type: 'array',
          description:
            'Positional arguments passed to the function, in the order the ABI expects. Use decimal strings for bigints.',
          items: { type: 'string' },
        },
        abi: {
          type: 'array',
          description:
            'Optional ABI fragment for the function. If omitted, the mobile falls back to its built-in ERC20 ABI.',
          items: { type: 'object' },
        },
      },
      required: ['chain_id', 'contract_address', 'function_name'],
      additionalProperties: false,
    },
  },
  get_transaction: {
    name: 'get_transaction',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Fetch an on-chain transaction by hash.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        tx_hash: TX_HASH_PROP,
      },
      required: ['chain_id', 'tx_hash'],
      additionalProperties: false,
    },
  },
  get_wallet_address: {
    name: 'get_wallet_address',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Return the address of the connected mobile wallet.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_supported_chains: {
    name: 'get_supported_chains',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'List EVM chains supported by the mobile wallet client.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_wallet_tokens: {
    name: 'get_wallet_tokens',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description:
      'Return the canonical supported-token list for a chain (or several ' +
      "chains in parallel), sourced from the backend's token API — the same " +
      "data the wallet's Send screen uses. Each row carries token_id " +
      '(backend UUID — pass to get_points_price), symbol, name, ' +
      'contract address, decimals, is_native / is_stable_coin flags, ' +
      'optional pegged_currency (fiat code like "IDR" — only stablecoins ' +
      'with this field are eligible for deposit_points), and ' +
      '(when `include_balance: true`) the live on-chain balance. Use this ' +
      "tool to resolve a token symbol (e.g. 'IDRX', 'USDT') to its contract " +
      'address before calling transfer_erc20 / approve_erc20 / read_contract — ' +
      'NEVER guess an address. The backend does case-insensitive substring ' +
      "matching on the `symbol` filter, so passing `symbol: 'IDRX'` returns " +
      "the IDRX row directly. For questions like \"where do I hold IDRX?\" " +
      'pass `chain_ids: [8453, 1, ...]` to fan out in parallel. Use ' +
      '`is_stable_coin: true` + `include_balance: true` to answer stablecoin ' +
      'overviews. If the result is empty for a symbol the user asked about, ' +
      'the token is not in the wallet\'s supported list for that chain — ask ' +
      'the user for the contract address and then use read_contract with ' +
      'balanceOf. DO NOT report balance as zero on an empty match.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: {
          type: 'integer',
          description:
            'Single chain to list tokens for. Defaults to wallet_context.chain_id. ' +
            'Ignored if `chain_ids` is provided.',
        },
        chain_ids: {
          type: 'array',
          items: { type: 'integer' },
          description:
            'Multi-chain variant: list of chain_ids to scan in parallel. ' +
            'When provided, the response shape is ' +
            '`{ chains: [{ chain_id, tokens }, …], chain_errors?: [...] }` ' +
            'instead of the single-chain `{ chain_id, tokens }` shape. ' +
            'Per-chain errors are captured in `chain_errors` so one bad ' +
            'chain does not fail the whole call.',
        },
        include_balance: {
          type: 'boolean',
          description:
            'If true, resolve live on-chain balances via the mobile public ' +
            'client. Balance fields (`balance_wei`, `balance_display`) are ' +
            'omitted for tokens whose balanceOf call fails.',
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
            'If true, return only stablecoin tokens (USDT, USDC, IDRX, DAI). ' +
            'If false, return only non-stablecoin tokens. Omit to return all. ' +
            'Stablecoin classification comes from the backend registry; ' +
            'user-added custom tokens default to non-stable.',
        },
        is_native_currency: {
          type: 'boolean',
          description:
            "If true (default), include the chain's native currency (ETH, MATIC, …). " +
            'If false, exclude it.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  // ─── Mobile / blockchain_read — capability `simulate` ───────────────────────
  estimate_gas: {
    name: 'estimate_gas',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'simulate',
    description: 'Estimate gas for a prospective transaction without sending it.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        to: ADDRESS_PROP('Recipient / contract address for the prospective call.'),
        value_wei: WEI_AMOUNT_PROP(
          'Native token value to send with the call, in wei (base-10 string). Use "0" for contract calls that do not transfer value.',
        ),
        data: {
          type: 'string',
          pattern: '^0x[0-9a-fA-F]*$',
          description:
            'Optional calldata hex string. Required for contract calls, omit for plain native transfers.',
        },
      },
      required: ['chain_id', 'to', 'value_wei'],
      additionalProperties: false,
    },
  },

  // ─── Mobile / blockchain_write — capability `write` ─────────────────────────
  send_native_token: {
    name: 'send_native_token',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description: 'Send native token (e.g. ETH) from the mobile wallet to an address.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        to: ADDRESS_PROP('Recipient address.'),
        value_wei: WEI_AMOUNT_PROP(
          'Amount of native token to send, in wei (base-10 string). MUST be greater than zero.',
        ),
      },
      required: ['chain_id', 'to', 'value_wei'],
      additionalProperties: false,
    },
  },
  transfer_erc20: {
    name: 'transfer_erc20',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Transfer an ERC20 token from the mobile wallet to a recipient. ' +
      'ALWAYS obtain contract_address from get_wallet_tokens — never guess it. ' +
      'Provide token_amount (human-readable, e.g. "98000") and token_decimals ' +
      '(integer from get_wallet_tokens, e.g. 2 for IDRX) so the mobile can ' +
      'compute the on-chain units via parseUnits — do NOT compute amount_wei ' +
      'yourself, decimal arithmetic on non-18-decimal tokens is error-prone.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        contract_address: ADDRESS_PROP(
          'ERC20 token contract address from get_wallet_tokens.',
        ),
        to: ADDRESS_PROP('Recipient address.'),
        token_amount: {
          type: 'string',
          description:
            'Human-readable transfer amount, e.g. "98000" for 98 000 IDRX. ' +
            'The mobile calls parseUnits(token_amount, token_decimals) internally.',
        },
        token_decimals: {
          type: 'integer',
          description:
            'Decimal places for this token (from get_wallet_tokens). ' +
            'e.g. 2 for IDRX, 6 for USDC, 18 for most ERC20s.',
          minimum: 0,
        },
        amount_wei: WEI_AMOUNT_PROP(
          'Fallback: pre-computed token amount in the token\'s smallest unit ' +
          '(base-10 string). Use token_amount + token_decimals instead — ' +
          'this field is kept for backwards compatibility only.',
        ),
      },
      required: ['chain_id', 'contract_address', 'to', 'token_amount', 'token_decimals'],
      additionalProperties: false,
    },
  },
  write_contract: {
    name: 'write_contract',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description: 'Call a state-changing function on a smart contract from the mobile wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        contract_address: ADDRESS_PROP('Contract address to call.'),
        function_name: {
          type: 'string',
          description: 'Name of the state-changing function to call.',
        },
        args: {
          type: 'array',
          description:
            'Positional arguments for the function call, ordered by the ABI. Use decimal strings for bigint parameters.',
          items: { type: 'string' },
        },
        value_wei: WEI_AMOUNT_PROP(
          'Optional native token value to send with the call, in wei (base-10 string). Defaults to "0".',
        ),
        abi: {
          type: 'array',
          description:
            'Optional ABI fragment describing the function. If omitted, the mobile falls back to its built-in ERC20 ABI.',
          items: { type: 'object' },
        },
      },
      required: ['chain_id', 'contract_address', 'function_name', 'args'],
      additionalProperties: false,
    },
  },
  approve_erc20: {
    name: 'approve_erc20',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Approve an ERC20 spender allowance from the mobile wallet. ' +
      'Provide token_amount (human-readable) and token_decimals so the mobile ' +
      'can call parseUnits internally — do NOT compute amount_wei yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: CHAIN_ID_PROP,
        contract_address: ADDRESS_PROP('ERC20 token contract address.'),
        spender: ADDRESS_PROP('Address being approved to spend tokens.'),
        token_amount: {
          type: 'string',
          description:
            'Human-readable allowance amount, e.g. "98000". ' +
            'The mobile calls parseUnits(token_amount, token_decimals) internally. ' +
            'Use "0" to revoke an existing allowance.',
        },
        token_decimals: {
          type: 'integer',
          description:
            'Decimal places for this token (from get_wallet_tokens). ' +
            'e.g. 2 for IDRX, 6 for USDC, 18 for most ERC20s.',
          minimum: 0,
        },
        amount_wei: WEI_AMOUNT_PROP(
          'Fallback: allowance in the token\'s smallest unit (base-10 string). ' +
          'Use token_amount + token_decimals instead. Use "0" to revoke.',
        ),
      },
      required: ['chain_id', 'contract_address', 'spender', 'token_amount', 'token_decimals'],
      additionalProperties: false,
    },
  },

  // ─── Mobile / points — capability `read` ───────────────────────────────────
  // All points & redemption tools run on the mobile client per protocol
  // v1.1 §12. The server has zero knowledge of the user's JWT.
  get_redemption_categories: {
    name: 'get_redemption_categories',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'List all redemption product categories (voucher, pulsa, game top-up, …). ' +
      'Auth required — the mobile loads the user JWT from secure storage.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_redemption_catalog: {
    name: 'get_redemption_catalog',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Return the redemption catalog grouped by category (public endpoint). ' +
      'Use this as an overview before drilling into a specific product.',
    inputSchema: {
      type: 'object',
      properties: {
        take: {
          type: 'integer',
          description:
            'Optional max products per category (default 6 on the backend).',
          minimum: 1,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  search_redemption_catalog: {
    name: 'search_redemption_catalog',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Search the redemption catalog by name and/or category (public endpoint). ' +
      'Returns a flat list of matching products with their ids for follow-up calls.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Optional product name filter (substring match).',
        },
        category_id: {
          type: 'string',
          description: 'Optional category UUID to scope the search.',
        },
        take: {
          type: 'integer',
          description: 'Maximum number of results to return.',
          minimum: 1,
        },
        cursor: {
          type: 'string',
          description: 'Opaque pagination cursor from a previous response.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  get_product_details: {
    name: 'get_product_details',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Fetch full product detail — variants and their point prices — for a ' +
      'redemption product. The agent uses this to present variant options to ' +
      'the user and obtain the product_variant_id + product_price_id pair ' +
      'needed by execute_redemption.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Redemption product id (from the catalog).',
        },
      },
      required: ['product_id'],
      additionalProperties: false,
    },
  },
  get_product_input_fields: {
    name: 'get_product_input_fields',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Fetch the dynamic input fields required for a redemption product ' +
      '(phone number, game id, …). Call this whenever get_product_details ' +
      'returns `input_type != null` and collect each field from the user ' +
      'before calling execute_redemption.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Redemption product id to look up input fields for.',
        },
      },
      required: ['product_id'],
      additionalProperties: false,
    },
  },
  get_points_price: {
    name: 'get_points_price',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Return the current token-to-points conversion rate (public endpoint). ' +
      'Call this before deposit_points so you can show the user the expected ' +
      'points they will receive for their token amount.',
    inputSchema: {
      type: 'object',
      properties: {
        token_id: {
          type: 'string',
          description:
            'Token UUID from the mobile token registry (not the symbol).',
        },
        currency: {
          type: 'string',
          description: 'Fiat currency code, e.g. "IDR".',
        },
      },
      required: ['token_id', 'currency'],
      additionalProperties: false,
    },
  },
  get_points_balance: {
    name: 'get_points_balance',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      "Return the connected wallet's current points balance. Auth required. " +
      'ALWAYS call this before execute_redemption so you can verify the ' +
      'user has enough points for the chosen variant.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_points_history: {
    name: 'get_points_history',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Return a cursor-paginated history of points transactions (deposits, ' +
      'spends, refunds, bonuses) for the connected wallet. Auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['DEPOSIT', 'SPEND', 'REFUND', 'BONUS'],
          description: 'Optional filter by transaction type.',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'FAILED'],
          description: 'Optional filter by transaction status.',
        },
        cursor: {
          type: 'string',
          description: 'Opaque pagination cursor from a previous response.',
        },
        limit: {
          type: 'integer',
          description: 'Max rows to return (default 20).',
          minimum: 1,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  // ─── Mobile / points — capability `write` ──────────────────────────────────
  deposit_points: {
    name: 'deposit_points',
    category: 'points',
    executor: 'mobile',
    capability: 'write',
    description:
      'Deposit tokens into the points system. This triggers an on-chain ERC20 ' +
      'transfer from the wallet followed by an authenticated API call to ' +
      'register the deposit; the mobile handles both legs. ALWAYS call ' +
      'get_points_price first so you can pass a meaningful expected_points ' +
      'into the approval sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        token_symbol: {
          type: 'string',
          description:
            'Human-readable token symbol, e.g. "IDRX". The mobile resolves ' +
            'the concrete tokenId, blockchainId, and contract address.',
        },
        token_amount: {
          type: 'string',
          description:
            'Human-readable token amount to deposit (e.g. "100"). NOT wei.',
        },
        chain_id: {
          type: 'integer',
          description:
            'Optional chain id override. Defaults to wallet_context.chain_id.',
          minimum: 1,
        },
        expected_points: {
          type: 'string',
          description:
            'Expected points to receive, as a decimal string, computed from ' +
            'get_points_price. Shown in the approval summary and validated ' +
            'by the mobile against the live rate before executing.',
        },
      },
      required: ['token_symbol', 'token_amount', 'expected_points'],
      additionalProperties: false,
    },
  },
  execute_redemption: {
    name: 'execute_redemption',
    category: 'points',
    executor: 'mobile',
    capability: 'write',
    description:
      'Irreversibly spend points to redeem a product variant. The mobile ' +
      'calls POST /api/redeem/execute and polls for a terminal status (up to ' +
      '4 retries for voucher delivery). Always collect the variant, price, ' +
      'and any required customer_info fields from the user BEFORE calling ' +
      'this tool — never guess. Pass `product_id` so the executor can ' +
      'validate `customer_info` against the canonical field list and strip ' +
      'non-digits from phone/number values (same flow the Send / Purchase ' +
      'screens use).',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description:
            'Redemption product id (from get_product_details.id). Required ' +
            'so the executor can fetch the canonical input fields, validate ' +
            'that customer_info uses the correct keys, and normalize ' +
            'phone/number values.',
        },
        product_variant_id: {
          type: 'string',
          description:
            'Variant id obtained from get_product_details.variants[].id.',
        },
        product_price_id: {
          type: 'string',
          description:
            'Price id obtained from get_product_details.variants[].prices[].id.',
        },
        customer_info: {
          description:
            'Dynamic input fields collected from the user. MUST use the exact ' +
            '`key` values returned by get_product_input_fields.fields[*].key ' +
            '— NEVER invent keys and NEVER use the human-readable `label`. ' +
            'May be passed as either an object map `{key: value}` or the ' +
            'array form `[{key, value}, ...]`. The executor will strip ' +
            'non-digit characters (dashes, spaces) from PHONE / NUMBER / ' +
            'NUMERIC field values automatically, so the user may provide a ' +
            'formatted phone number like "0812-3456-7890" — pass it through ' +
            'verbatim.',
          oneOf: [
            {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  value: { type: 'string' },
                },
                required: ['key', 'value'],
                additionalProperties: false,
              },
            },
          ],
        },
        product_name: {
          type: 'string',
          description:
            'Display-only product name, e.g. "Telkomsel 50K", used in the ' +
            'approval summary shown to the user.',
        },
        points_cost: {
          type: 'string',
          description:
            'Display-only points cost for this variant (e.g. "5000"), used ' +
            'in the approval summary. MUST match the chosen variant price.',
        },
      },
      required: [
        'product_id',
        'product_variant_id',
        'product_price_id',
        'product_name',
        'points_cost',
      ],
      additionalProperties: false,
    },
  },

  // ─── Mobile / points — capability `read` (status/history) ──────────────────
  get_redemption_status: {
    name: 'get_redemption_status',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      'Poll the status of a redemption by id. Auth required. Call this ONCE ' +
      'if a previous execute_redemption returned "PROCESSING"; do NOT loop.',
    inputSchema: {
      type: 'object',
      properties: {
        redemption_id: {
          type: 'string',
          description: 'Redemption id returned by execute_redemption.',
        },
      },
      required: ['redemption_id'],
      additionalProperties: false,
    },
  },
  get_redemption_history: {
    name: 'get_redemption_history',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
    description:
      "Cursor-paginated list of the wallet's past redemptions, including " +
      'product, variant, and points spent. Auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
          description: 'Optional filter by redemption status.',
        },
        cursor: {
          type: 'string',
          description: 'Opaque pagination cursor from a previous response.',
        },
        limit: {
          type: 'integer',
          description: 'Max rows to return.',
          minimum: 1,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  // ─── Mobile / address_book — capability `read` ─────────────────────────────
  // Address book tools run on the mobile client because the data lives in the
  // user's authenticated session — the server has zero knowledge of contacts.
  // Auth is handled transparently by the mobile's ky instance (Bearer token
  // from secure storage). All three tools are classified `read` / silent UX.
  get_address_book: {
    name: 'get_address_book',
    category: 'utility',
    executor: 'mobile',
    capability: 'read',
    description:
      "Return all saved contacts from the user's address book. Each contact " +
      'has an id, label (display name), blockchain address, and optional ' +
      'ens_name, notes, and chain_name fields. Use this to list contacts or ' +
      'to resolve a name to an address before initiating a transfer. ' +
      'Auth required — the mobile loads the user JWT from secure storage.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_address_book_entry: {
    name: 'get_address_book_entry',
    category: 'utility',
    executor: 'mobile',
    capability: 'read',
    description:
      'Fetch a single address book contact by its id. Use this for a precise ' +
      "look-up when you already know the contact's id (e.g. from a previous " +
      'get_address_book or search_address_book call). Returns id, label, ' +
      'address, and optional ens_name / notes / chain_name. Auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique contact id returned by get_address_book or search_address_book.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  search_address_book: {
    name: 'search_address_book',
    category: 'utility',
    executor: 'mobile',
    capability: 'read',
    description:
      "Search the user's address book contacts by name, address, or chain. " +
      'Use this to resolve a human label like "Alice" or "my Binance wallet" ' +
      'to a blockchain address before a transfer — NEVER guess an address. ' +
      'At least one of query, chain_name, or is_evm must be provided. ' +
      'Returns a filtered contacts list with the same fields as get_address_book. ' +
      'Auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Case-insensitive substring searched across label, address, ' +
            'ens_name, and notes fields.',
        },
        chain_name: {
          type: 'string',
          description:
            'Exact (case-insensitive) match on the contact\'s chainName field ' +
            '(e.g. "Ethereum", "Base", "BNB Smart Chain").',
        },
        is_evm: {
          type: 'boolean',
          description:
            'If true, return only EVM-compatible contacts. If false, return ' +
            'only non-EVM contacts. Omit to return all.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

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

  // ─── Mobile / points — capability `simulate` ───────────────────────────────
  request_authentication: {
    name: 'request_authentication',
    category: 'points',
    executor: 'mobile',
    capability: 'simulate',
    description:
      'Prompt the user to log in to the points and redemption service. Call ' +
      'this when wallet_context.points_authenticated is false and the user ' +
      'wants to check their balance, redeem a product, or view redemption ' +
      'history. Returns {success: true} on login, ' +
      "{success: false, error: '...'} on cancellation or failure. NEVER pass " +
      'any credential-like field in the input.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
};
