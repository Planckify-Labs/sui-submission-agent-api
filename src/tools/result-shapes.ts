/**
 * Canonical `ToolResult.data` shapes for mobile-executed tools.
 *
 * These types are **normative as of protocol v1.1** (see
 * `protocol-updates/protocol_v1.1.md` §6 "Tool result data shapes" and §8
 * "BigInt on the wire"). Any change to the shape of `data` returned by a
 * mobile executor requires a protocol version bump — both the mobile
 * executor and the server agent loop depend on this contract.
 *
 * Purpose: documentation and tooling only. The server hands `ToolResult.data`
 * verbatim to the LLM; it does NOT validate inbound data against these types
 * at runtime. They exist to prevent silent drift between the mobile reference
 * executors and the LLM's expected input.
 *
 * BigInt encoding (§8): all fields whose values may exceed
 * `Number.MAX_SAFE_INTEGER` — `*_wei`, `block_number`, `gas_used`, and any
 * bigint nested inside `read_contract.result` — MUST be serialized as base-10
 * decimal strings. Consumers decode with `BigInt(str)`, never `Number(str)`.
 *
 * See also: `src/tools/registry.ts` for the tool classification registry.
 */

/**
 * `get_balance` / `get_wallet_balance`
 * Native balance for an address on a chain.
 *
 * CRITICAL: the agent MUST read `balance_display` (a pre-formatted
 * decimal string already scaled to `decimals`) when reporting balances
 * to the user. It MUST NOT attempt to divide `balance_wei` by a power
 * of ten in its head — LLMs slip decimal places on 18-digit division
 * and will produce values 1000× wrong. `balance_wei` is still provided
 * for cases that need exact arithmetic (e.g. computing a max-send
 * amount after gas), but user-facing numbers come from
 * `balance_display`.
 */
export type GetBalanceResult = {
  address: string;
  chain_id: number;
  /** Base-10 string (wei). See §8. Used only for exact arithmetic. */
  balance_wei: string;
  /** Human-readable balance already formatted to `decimals`. Agent SHOULD use this for user-facing reporting. */
  balance_display: string;
  /** Decimals the `balance_display` was scaled with. */
  decimals: number;
  /** Native currency ticker (e.g. "ETH", "MATIC"). */
  symbol: string;
  /** Native currency full name (e.g. "Ethereum", "Matic Token"). */
  name: string;
};

/**
 * `get_transaction`
 *
 * Discriminated by `pending`. Confirmed transactions carry the receipt fields
 * plus a pre-formatted `fee_display` so the agent can report "fee: 0.00042 ETH"
 * without doing wei arithmetic. Pending transactions expose the in-mempool
 * call data plus a pre-formatted `value_display` for the same reason.
 *
 * Agent rule: when reporting fees or transfer values to the user, ALWAYS read
 * `fee_display` / `value_display`. Never divide the `*_wei` fields yourself.
 */
export type GetTransactionResult =
  | {
      chain_id: number;
      status: 'success' | 'reverted';
      /** Base-10 string. See §8. */
      block_number: string;
      /** Base-10 string (gas units). See §8. */
      gas_used: string;
      /** Base-10 string (wei). Gas price actually paid. */
      effective_gas_price_wei: string;
      /** Base-10 string (wei). Total fee = gas_used × effective_gas_price. */
      fee_wei: string;
      /** Human-readable total fee, already scaled to `decimals`. */
      fee_display: string;
      decimals: number;
      /** Native currency ticker for display. */
      symbol: string;
      from: string;
      to: string | null;
    }
  | {
      chain_id: number;
      pending: true;
      from: string;
      to: string | null;
      /** Base-10 string (wei). See §8. */
      value_wei: string;
      /** Human-readable transfer value, already scaled to `decimals`. */
      value_display: string;
      decimals: number;
      /** Native currency ticker for display. */
      symbol: string;
    };

/**
 * `get_wallet_address`
 * The currently-active wallet address on the mobile client.
 */
export type GetWalletAddressResult = {
  address: string;
};

/**
 * `get_supported_chains`
 * Chains the mobile executor is configured to reach.
 */
export type GetSupportedChainsResult = {
  chains: Array<{
    chain_id: number;
    name: string;
    native_symbol: string;
    native_decimals: number;
    rpc_url: string;
    block_explorer: string | null;
  }>;
};

/**
 * `estimate_gas`
 *
 * Gas estimate for a prospective transaction, pre-formatted so the agent can
 * report a fee directly (e.g. "~0.00042 ETH") without doing wei arithmetic.
 *
 * Field semantics:
 *  - `gas_units` / `gas_wei`: identical value, expressed in gas units (NOT wei
 *    despite the legacy field name). Kept as two aliases because `gas_wei` is
 *    in the existing protocol and renaming would be a breaking change.
 *  - `gas_price_wei`: `publicClient.getGasPrice()` at the moment of the call.
 *    Absent if the gas-price lookup failed.
 *  - `fee_wei`: `gas_units × gas_price_wei` — the total fee in native wei.
 *    Absent if `gas_price_wei` is absent.
 *  - `fee_display`: `fee_wei` scaled to `decimals` as a decimal string.
 *    Agent MUST use this when reporting the fee to the user.
 *  - `symbol` / `decimals`: native currency metadata for display.
 */
export type EstimateGasResult = {
  chain_id: number;
  /** Legacy alias for `gas_units`. Value is gas units, NOT wei. */
  gas_wei: string;
  /** Gas units the call will consume. */
  gas_units: string;
  /** Base-10 string (wei). Gas price at the moment of the estimate. Absent if unavailable. */
  gas_price_wei?: string;
  /** Base-10 string (wei). Total fee. Absent if `gas_price_wei` is unavailable. */
  fee_wei?: string;
  /** Human-readable total fee. Agent MUST use this for user-facing output. */
  fee_display?: string;
  decimals: number;
  symbol: string;
};

/**
 * `read_contract`
 *
 * `result` mirrors the ABI return value. May be a primitive, array, or nested
 * struct. Any bigints inside MUST be base-10 strings (§8) — the mobile
 * reference executor runs `safeSerialize()` on the viem return value before
 * sending it across the wire.
 */
export type ReadContractResult = {
  chain_id: number;
  contract_address: string;
  function_name: string;
  result: unknown;
};

/**
 * `get_wallet_tokens`
 *
 * Token list for a given chain, optionally filtered by symbol / stablecoin /
 * native-currency status, with optional live balances. Canonical shape per
 * `protocol-updates/protocol_v1.1.md` §4 "New tool: get_wallet_tokens".
 *
 * Notes:
 *  - The native currency, when included, appears in `tokens` with
 *    `is_native: true` and `address` set to the EVM zero address
 *    (`0x0000000000000000000000000000000000000000`).
 *  - `balance_wei` / `balance_display` are present IFF the caller passed
 *    `include_balance: true`. `balance_wei` is a base-10 string per §8
 *    "BigInt on the wire"; `balance_display` is already scaled to `decimals`.
 *  - `is_stable_coin` is sourced from the mobile's static token registry —
 *    never derived from the symbol alone.
 */
export type GetWalletTokensResult = {
  chain_id: number;
  tokens: Array<{
    symbol: string;
    name: string;
    /** EVM address. Zero address for the chain's native currency. */
    address: `0x${string}`;
    decimals: number;
    is_native: boolean;
    is_stable_coin: boolean;
    logo_url?: string;
    /** Base-10 string (wei). Present iff `include_balance` was true. See §8. */
    balance_wei?: string;
    /** Formatted to `decimals`. Present iff `balance_wei` is present. */
    balance_display?: string;
  }>;
};

// ─── Points & redemption (protocol v1.1 §12, §13) ─────────────────────────
//
// All shapes mirror the mobile's `TPoint*` / `TRedemption*` / `TProduct*`
// types. `deposit_points` and `execute_redemption` include the canonical
// write-path outputs; the rest mirror the REST endpoint response bodies.

/** `get_redemption_categories` — list of product categories. */
export type GetRedemptionCategoriesResult = {
  categories: Array<{
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
  }>;
};

/** `get_redemption_catalog` — catalog grouped by category. */
export type GetRedemptionCatalogResult = {
  groups: Array<{
    category: { id: string; name: string };
    products: Array<{
      id: string;
      name: string;
      description: string;
      image_url: string | null;
      code: string;
      /** null when no dynamic input fields are required. */
      input_type: string | null;
    }>;
  }>;
};

/** `search_redemption_catalog` — flat list of matching products. */
export type SearchRedemptionCatalogResult = {
  products: Array<{
    id: string;
    name: string;
    description: string;
    image_url: string | null;
    code: string;
    category_id: string;
    input_type: string | null;
  }>;
};

/** `get_product_details` — full product detail with variants + prices. */
export type GetProductDetailsResult = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  code: string;
  /** Non-null → agent must call get_product_input_fields next. */
  input_type: string | null;
  category: { id: string; name: string };
  variants: Array<{
    /** productVariantId — needed for execute_redemption. */
    id: string;
    name: string;
    description: string;
    is_voucher: boolean;
    prices: Array<{
      /** productPriceId — needed for execute_redemption. */
      id: string;
      /** Price in points (the `sellPrice` field). */
      sell_price: string;
      currency: string;
      is_active: boolean;
    }>;
  }>;
};

/** `get_product_input_fields` — dynamic form fields for redemption. */
export type GetProductInputFieldsResult = {
  product_id: string;
  product_name: string;
  fields: Array<{
    key: string;
    type: string;
    label: string;
    options?: string[];
  }>;
};

/** `get_points_price` — public token ↔ points conversion rate. */
export type GetPointsPriceResult = {
  point_price: string;
  currency: string;
  token: {
    id: string;
    symbol: string;
    decimals: number;
    price_in_currency: string;
  };
  points_per_token: string;
  token_per_point: string;
  minimum_points: number;
  minimum_token_amount: string;
  updated_at: string;
};

/** `get_points_balance` — current points balance as a decimal string. */
export type GetPointsBalanceResult = {
  balance: string;
};

/** `get_points_history` — cursor-paginated points transactions. */
export type GetPointsHistoryResult = {
  transactions: Array<{
    id: string;
    type: 'DEPOSIT' | 'SPEND' | 'REFUND' | 'BONUS';
    amount: string;
    balance_before: string;
    balance_after: string;
    status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'FAILED';
    token_amount?: string;
    token_symbol?: string;
    tx_hash?: string;
    created_at: string;
  }>;
  next_cursor: string | null;
  has_more: boolean;
};

/**
 * `deposit_points` — terminal result of a token → points deposit.
 * The mobile handles the full flow (on-chain tx + API registration +
 * status polling); the agent only sees the final state.
 */
export type DepositPointsResult = {
  deposit_id: string;
  status: 'COMPLETED' | 'FAILED';
  /** Actual points credited (may differ slightly from expected). */
  points_received: string;
  /** On-chain transaction hash of the deposit transfer. */
  tx_hash: string;
};

/**
 * `execute_redemption` — terminal result of spending points on a product.
 * Mirrors `TRedemptionDetail`. `voucher_code` may still be null when
 * `status === "COMPLETED"` if the vendor has not confirmed delivery yet.
 */
export type ExecuteRedemptionResult = {
  redemption_id: string;
  status: 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'REFUNDED';
  points_spent: string;
  voucher_code?: string | null;
  vendor_ref_id?: string | null;
};

/** `get_redemption_status` — poll a single redemption by id. */
export type GetRedemptionStatusResult = {
  redemption_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  points_spent: string;
  vendor_ref_id: string | null;
  created_at: string;
};

/** `get_redemption_history` — cursor-paginated past redemptions. */
export type GetRedemptionHistoryResult = {
  redemptions: Array<{
    id: string;
    status: string;
    points_spent: string;
    created_at: string;
    product: {
      id: string;
      name: string;
      is_voucher: boolean;
      variant: { id: string; name: string };
      price: { amount: number; currency: string };
    };
    /** Present on detail fetch, not history. */
    voucher_code?: string | null;
  }>;
  next_cursor: string | null;
  has_more: boolean;
};

// ─── Sui native shapes ────────────────────────────────────────────────────
//
// Sui digests are base58, not 0x-hex. Write tools therefore return the
// digest in `data.digest` instead of populating the wire-typed `tx_hash`
// field (regex-validated as 0x-hex server-side). Same constraint as Solana
// signatures.
//
// MIST is Sui's smallest unit: 1 SUI = 1e9 MIST. Like the EVM `*_wei` and
// Solana `*_lamports` fields, `*_mist` is base-10 string per protocol §8.

/**
 * `get_wallet_sui_balance` / `get_sui_balance`
 * Native SUI balance for the connected wallet (or an arbitrary address)
 * on the active Sui network.
 *
 * Emits the unified `WalletBalancesPayload` shape with a single group
 * containing the native SUI row, so `BalancesCard` renders it through
 * the same path as EVM and Solana single-balance reads. Agent rule:
 * read `balance_display` for user-facing reporting; never divide
 * `balance_raw` (MIST) by 1e9 in your head.
 */
export type GetSuiBalanceResult = {
  groups: Array<{
    namespace: 'sui';
    /** Sui network identifier ("mainnet", "testnet", "devnet"). */
    chain_id: string;
    /** Display label, e.g. "Sui Mainnet". */
    chain_label: string;
    chain_symbol: 'SUI';
    tokens: Array<{
      symbol: 'SUI';
      name: 'Sui';
      /** Empty string for native — matches EVM/Solana convention. */
      address: '';
      /** Always 9 for SUI. */
      decimals: 9;
      is_native: true;
      is_stable_coin: false;
      /** Base-10 string (MIST). Used only for exact arithmetic. */
      balance_raw: string;
      /** Human-readable balance already formatted to 9 decimals. */
      balance_display: string;
    }>;
  }>;
};

/**
 * `get_wallet_sui_coins`
 *
 * Coin<T> list for the active Sui network, optionally filtered by symbol /
 * stablecoin / native-currency status, with optional live balances.
 *
 * Emits the unified `WalletBalancesPayload` shape under the `display`
 * field (the same shape EVM `get_wallet_tokens` and Solana
 * `get_wallet_spl_tokens` use), so a single `BalancesCard` renders all
 * three. The agent slice (`data`) is a compact projection.
 *
 * Notes:
 *  - On Sui the row's `address` field carries the Move struct path
 *    (`0x{addr}::{module}::{Name}`) — this is Sui's coin type identifier.
 *    Native SUI appears with `is_native: true` and `address:
 *    "0x2::sui::SUI"`.
 *  - `balance_raw` / `balance_display` are present iff the caller passed
 *    `include_balance: true`. `balance_raw` is a base-10 string of MIST
 *    (or the coin's minor unit) per §8; `balance_display` is already
 *    scaled to `decimals`.
 */
export type GetSuiWalletCoinsResult = {
  groups: Array<{
    namespace: 'sui';
    /** Sui network identifier (e.g. "mainnet", "testnet", "devnet"). */
    chain_id: string;
    /** Display label, e.g. "Sui Mainnet". */
    chain_label: string;
    chain_symbol: 'SUI';
    tokens: Array<{
      symbol: string;
      name?: string;
      /** Move struct path `0x{addr}::{module}::{Name}` — Sui's coin type. */
      address: string;
      decimals: number;
      is_native: boolean;
      is_stable_coin: boolean;
      logo_url?: string;
      pegged_currency?: string;
      /** Base-10 string (coin minor units). Present iff `include_balance` was true. */
      balance_raw?: string;
      /** Formatted to `decimals`. Present iff `balance_raw` is present. */
      balance_display?: string;
    }>;
  }>;
};

/**
 * `send_sui` — terminal result of a native SUI transfer.
 *
 * IMPORTANT: `digest` is base58, not 0x-hex. Do NOT expect `tx_hash`.
 */
export type SendSuiResult = {
  /** Base58 transaction digest. */
  digest: string;
  to: string;
  network: string;
  /** Base-10 string (MIST). */
  amount_mist: string;
  /** Human-readable amount as supplied by the agent. */
  amount_sui: string;
};

/**
 * `send_sui_coin` — terminal result of a non-native Coin<T> transfer.
 *
 * IMPORTANT: `digest` is base58, not 0x-hex. Do NOT expect `tx_hash`.
 */
export type SendSuiCoinResult = {
  /** Base58 transaction digest. */
  digest: string;
  to: string;
  /** Move struct path `0x{addr}::{module}::{Name}`. */
  coin_type: string;
  network: string;
  /** Base-10 string (coin minor units). */
  amount_raw: string;
  /** Human-readable amount as supplied by the agent. */
  token_amount: string;
  decimals: number;
};

/**
 * `request_authentication` — user-facing login flow (§13).
 *
 * `status === "success"` with `data.success === false` is the canonical
 * "user cancelled login" shape — the tool executed correctly, the user
 * simply chose not to authenticate. The agent MUST NOT retry any
 * auth-required points tool in that case.
 */
export type RequestAuthenticationResult =
  | { success: true }
  | {
      success: false;
      error: 'user_cancelled' | 'network_error' | 'wallet_mismatch' | string;
    };

/**
 * `defi_intent_preview` — compiled plan + guardian verdict (read; never
 * signs). Sui Intent Engine, spec §6.5. Every number the guardian surfaces
 * is pre-formatted into a `risk_flags[].detail` string; nothing here is a
 * bigint (§8.5).
 */
export type DefiIntentPreviewResult = {
  /** Opaque; pass to defi_intent_execute. */
  intent_id: string;
  /** Plain-language, hand-built (no raw data). */
  human_summary: string;
  /** Decimal string, when the venue exposes one (supply). */
  apy?: string;
  /** Decoded PTB commands — the "what it does on-chain" list. */
  decoded: Array<{
    kind: string;
    module?: string;
    function?: string;
  }>;
  risk_flags: Array<{
    // 'effect.mismatch' is computed from the dry-run's real balance changes
    // (dryRunTransactionBlock effects), not the venue quote — the why-Sui
    // pre-sign effect inspection.
    code:
      | 'slippage.high'
      | 'oracle.stale'
      | 'concentration.high'
      | 'effect.mismatch';
    severity: 'info' | 'warn' | 'block';
    title: string;
    detail: string;
  }>;
  /** true ⇒ the agent must NOT call defi_intent_execute. */
  blocked: boolean;
  /**
   * Plain-language list of the LIVE on-chain reads the guardian performed this
   * run (e.g. "Simulated this exact transaction on Sui", "Checked your live
   * balance") — proof the guardian inspects real state, not canned warnings.
   * The agent may narrate these.
   */
  inspected?: string[];
};

/**
 * `defi_intent_execute` — terminal. `digest` is base58, NOT tx_hash
 * (spec §6.5).
 */
export type DefiIntentExecuteResult = {
  digest: string;
  /** "testnet" | "mainnet" | "devnet". */
  network: string;
};
