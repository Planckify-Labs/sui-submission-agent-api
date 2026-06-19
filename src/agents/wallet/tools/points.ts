import { composeAgentTools } from '../../../tools/internal/compose';
import type { ToolMeta } from '../../../tools/internal/types';

export const WALLET_POINTS_TOOLS: Record<string, ToolMeta> = composeAgentTools('wallet', {
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

  // ─── Mobile / points — interactive login, treated as a read ───────────────
  // Capability is `read` so the mobile dispatcher routes it to the `silent`
  // UX treatment. The executor itself drives the SIWE flow
  // (`router.push('/auth')` + secure-storage poll) and never signs anything
  // on its own, so routing it as a read is faithful to what it actually does.
  request_authentication: {
    name: 'request_authentication',
    category: 'points',
    executor: 'mobile',
    capability: 'read',
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
});
