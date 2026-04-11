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
  | 'takumipay'
  | 'utility';

export interface ToolMeta {
  name: string;
  category: ToolCategory;
  executor: ToolExecutor;
  capability: ToolCapability;
  description: string;
}

export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  // ─── Mobile / blockchain_read — capability `read` ───────────────────────────
  get_balance: {
    name: 'get_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Read the native token balance of an address on a given chain.',
  },
  get_wallet_balance: {
    name: 'get_wallet_balance',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: "Read the connected mobile wallet's native token balance.",
  },
  read_contract: {
    name: 'read_contract',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Call a read-only (view/pure) function on a smart contract.',
  },
  get_transaction: {
    name: 'get_transaction',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Fetch an on-chain transaction by hash.',
  },
  get_wallet_address: {
    name: 'get_wallet_address',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'Return the address of the connected mobile wallet.',
  },
  get_supported_chains: {
    name: 'get_supported_chains',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'read',
    description: 'List EVM chains supported by the mobile wallet client.',
  },

  // ─── Mobile / blockchain_read — capability `simulate` ───────────────────────
  estimate_gas: {
    name: 'estimate_gas',
    category: 'blockchain_read',
    executor: 'mobile',
    capability: 'simulate',
    description: 'Estimate gas for a prospective transaction without sending it.',
  },

  // ─── Mobile / blockchain_write — capability `write` ─────────────────────────
  send_native_token: {
    name: 'send_native_token',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description: 'Send native token (e.g. ETH) from the mobile wallet to an address.',
  },
  transfer_erc20: {
    name: 'transfer_erc20',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description: 'Transfer an ERC20 token from the mobile wallet to a recipient.',
  },
  write_contract: {
    name: 'write_contract',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description: 'Call a state-changing function on a smart contract from the mobile wallet.',
  },
  approve_erc20: {
    name: 'approve_erc20',
    category: 'blockchain_write',
    executor: 'mobile',
    capability: 'write',
    description: 'Approve an ERC20 spender allowance from the mobile wallet.',
  },

  // ─── Server / takumipay — capability `read` ─────────────────────────────────
  get_products: {
    name: 'get_products',
    category: 'takumipay',
    executor: 'server',
    capability: 'read',
    description: 'List products available through TakumiPay.',
  },
  search_products: {
    name: 'search_products',
    category: 'takumipay',
    executor: 'server',
    capability: 'read',
    description: 'Search TakumiPay products by query / filters.',
  },
  get_product_prices: {
    name: 'get_product_prices',
    category: 'takumipay',
    executor: 'server',
    capability: 'read',
    description: 'Fetch current pricing for one or more TakumiPay products.',
  },
  get_latest_exchange_rate: {
    name: 'get_latest_exchange_rate',
    category: 'takumipay',
    executor: 'server',
    capability: 'read',
    description: 'Get the latest FX / token exchange rate from TakumiPay.',
  },

  // ─── Server / takumipay — capability `simulate` ─────────────────────────────
  create_booking: {
    name: 'create_booking',
    category: 'takumipay',
    executor: 'server',
    capability: 'simulate',
    description:
      'Reserve a TakumiPay booking slot server-side. No payment is taken; pairs with execute_booking.',
  },

  // ─── Mobile / takumipay — capability `write` ────────────────────────────────
  // All of these trigger on-chain payment, so they MUST run on mobile.
  execute_booking: {
    name: 'execute_booking',
    category: 'takumipay',
    executor: 'mobile',
    capability: 'write',
    description: 'Execute a previously reserved TakumiPay booking (triggers on-chain payment).',
  },
  cancel_booking: {
    name: 'cancel_booking',
    category: 'takumipay',
    executor: 'mobile',
    capability: 'write',
    description: 'Cancel a TakumiPay booking (may trigger an on-chain refund/settlement).',
  },
  create_purchase: {
    name: 'create_purchase',
    category: 'takumipay',
    executor: 'mobile',
    capability: 'write',
    description: 'Create and pay for a TakumiPay purchase (triggers on-chain payment).',
  },
};
