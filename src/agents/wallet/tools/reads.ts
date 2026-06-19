import { composeAgentTools } from '../../../tools/internal/compose';
import {
  ADDRESS_PROP,
  CHAIN_ID_PROP,
  TX_HASH_PROP,
  WEI_AMOUNT_PROP,
} from '../../../tools/internal/schemas';
import type { ToolMeta } from '../../../tools/internal/types';

export const WALLET_READ_TOOLS: Record<string, ToolMeta> = composeAgentTools('wallet', {
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

  // ─── Mobile / blockchain_read — read-only RPC call ─────────────────────────
  // Capability is `read` so the mobile dispatcher routes it to the `silent`
  // UX treatment. `estimate_gas` is a pure RPC call — no signature, no chain
  // mutation — so `read` is the faithful classification.
  estimate_gas: {
    name: 'estimate_gas',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
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
});
