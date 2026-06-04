import { composeAgentTools } from '../internal/compose';
import {
  ADDRESS_PROP,
  CHAIN_ID_PROP,
  WEI_AMOUNT_PROP,
} from '../internal/schemas';
import type { ToolMeta } from '../internal/types';

export const WALLET_WRITE_TOOLS: Record<string, ToolMeta> = composeAgentTools('wallet', {
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

  // ─── Agent-initiated x402 micropayments (Phase 5) ───────────────────────────
  // Onchain-adjacent ⇒ executor `mobile` (the device holds the signed
  // ERC-7710 allowance + settles via the relayer). Capability `write`: it
  // spends from the user's pre-authorized agent allowance, bounded on-chain
  // by the delegation caveat. The mobile executor refuses (and tells the
  // user to grant an allowance) when no `delegation` grant exists.
  x402_fetch: {
    name: 'x402_fetch',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description:
      'Fetch a paid resource that answers HTTP 402 Payment Required with an ' +
      'x402 / ERC-7710 challenge (premium data feeds, security oracles, gated ' +
      'API endpoints) and settle the sub-dollar payment automatically from the ' +
      "user's pre-authorized agent allowance. Returns the resource body plus a " +
      'settlement summary ({ paid, amount_usdc, rail, tx_hash }). If the price ' +
      'exceeds the remaining allowance the result is paid:false with ' +
      'over_budget:true — surface the top-up message, never retry blindly. ' +
      'Use this instead of a plain HTTP read whenever a resource requires payment.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full HTTPS URL of the protected resource to fetch.',
        },
        method: {
          type: 'string',
          description: 'HTTP method for the resource. Defaults to GET.',
        },
        maxSpendUsdc: {
          type: 'number',
          description:
            'Optional per-call ceiling in USDC (e.g. 0.5). Applied on top of ' +
            "the user's on-chain allowance — only ever narrows it, never widens.",
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
});
