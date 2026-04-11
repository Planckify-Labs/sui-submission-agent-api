/**
 * buildHumanSummary() — deterministic, server-side builder for the
 * `meta.human_summary` string that mobile renders in preview cards and
 * approval sheets.
 *
 * Protocol reference: AGENT_PROTOCOL.md §11 "The `human_summary` Builder
 * (Server-Side)".
 *
 * SECURITY: `input` arrives from the LLM. It MUST be Zod-validated at the
 * tool boundary before reaching this function. Even so, every case narrows
 * each field defensively and falls back to `"?"` on missing optionals so
 * the approval sheet never crashes on a malformed payload.
 *
 * Coverage: every tool in `TOOL_REGISTRY` with `capability: "simulate"` or
 * `capability: "write"` has an explicit case. Reads do not need summaries
 * (they execute silently). The default branch returns `Execute ${name}` so
 * any unknown tool still renders something safe.
 */

import { formatEther } from 'viem';

/**
 * Truncate an EVM-style address for display.
 *
 * Format: first 6 chars + `…` + last 2 chars  (e.g. `0x742d…ef`).
 *
 * Note: the task spec description says "first 6 + `…` + last 4", but every
 * canonical expected output in the spec uses 2 trailing chars
 * (e.g. `0x742d…ef`, `0xDeFi…ef`). We match the expected output strings,
 * which are the binding acceptance criterion.
 *
 * Handles non-string / too-short input gracefully by returning a safe
 * fallback instead of throwing.
 */
export function truncateAddress(addr: unknown): string {
  if (typeof addr !== 'string' || addr.length === 0) return '?';
  // Too short to meaningfully truncate — return as-is.
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-2)}`;
}

/**
 * Short-form truncation used by `write_contract` — first 6 chars + `…`,
 * no trailing characters (e.g. `0xAbCd…`).
 */
function truncateAddressShort(addr: unknown): string {
  if (typeof addr !== 'string' || addr.length === 0) return '?';
  if (addr.length <= 6) return addr;
  return `${addr.slice(0, 6)}…`;
}

/** Safely read a string field from `input`, returning fallback if missing. */
function str(input: Record<string, unknown>, key: string, fallback = '?'): string {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

/**
 * Best-effort ETH amount formatter.
 *
 * If the tool already passes a human-readable amount (e.g. `"0.5"`), we use
 * it as-is. If it passes a wei value as a `bigint` or a numeric string, we
 * run it through viem's `formatEther`. Returns `"?"` on anything unusable.
 */
function formatEthAmount(raw: unknown): string {
  if (typeof raw === 'bigint') {
    try {
      return formatEther(raw);
    } catch {
      return '?';
    }
  }
  if (typeof raw === 'string' && raw.length > 0) {
    // Heuristic: a decimal point means it's already human-formatted.
    if (raw.includes('.')) return raw;
    // Pure digits → interpret as wei.
    if (/^\d+$/.test(raw)) {
      try {
        return formatEther(BigInt(raw));
      } catch {
        return raw;
      }
    }
    return raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return '?';
}

export function buildHumanSummary(
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    // ─── simulate ──────────────────────────────────────────────────────────
    // estimate_gas: the tool pre-computes `eth_amount` (human-readable ETH)
    // and `usd_amount` (human-readable USD) since the raw gas_wei is not
    // useful to a human reading an approval sheet.
    case 'estimate_gas': {
      const eth = str(input, 'eth_amount');
      const usd = str(input, 'usd_amount');
      return `Gas estimate: ~${eth} ETH ($${usd})`;
    }

    // ─── write ─────────────────────────────────────────────────────────────
    // send_native_token: `amount` is a human-readable ETH string (e.g. "0.5"),
    // `to` is the destination address, `chain_name` is the human chain name.
    case 'send_native_token': {
      const amount = formatEthAmount(input.amount);
      const to = truncateAddress(input.to);
      const chain = str(input, 'chain_name', str(input, 'chain'));
      return `Send ${amount} ETH to ${to} on ${chain}`;
    }

    // transfer_erc20: ERC20 transfer with token symbol. `amount` is already a
    // human-readable token amount (ERC20 decimals are handled upstream).
    case 'transfer_erc20': {
      const amount = str(input, 'amount');
      const symbol = str(input, 'symbol');
      const to = truncateAddress(input.to);
      const chain = str(input, 'chain_name', str(input, 'chain'));
      return `Send ${amount} ${symbol} to ${to} on ${chain}`;
    }

    // write_contract: uses the short-form address truncation (trailing `…`
    // only) to match the protocol-spec example `Call \`transfer()\` on
    // 0xAbCd…`.
    case 'write_contract': {
      const fn = str(input, 'function_name');
      const addr = truncateAddressShort(input.address);
      return `Call \`${fn}()\` on ${addr}`;
    }

    // approve_erc20: `spender` is the contract being granted allowance,
    // `amount` is the human-readable cap, `symbol` is the token ticker.
    case 'approve_erc20': {
      const spender = truncateAddress(input.spender);
      const amount = str(input, 'amount');
      const symbol = str(input, 'symbol');
      return `Approve ${spender} to spend up to ${amount} ${symbol}`;
    }

    // create_booking (simulate): TakumiPay booking preview before payment.
    // `price_formatted` is the locale-formatted display string (e.g.
    // "Rp 50.000") so the server doesn't have to reimplement i18n currency.
    case 'create_booking': {
      const product = str(input, 'product_name');
      const price = str(input, 'price_formatted');
      return `Preview: ${product} — ${price} (not yet executed)`;
    }

    // execute_booking: the actual payment step for a reserved booking.
    case 'execute_booking': {
      const price = str(input, 'price_formatted');
      const product = str(input, 'product_name');
      const bookingId = str(input, 'booking_id');
      return `Pay ${price} for ${product} (booking #${bookingId})`;
    }

    // cancel_booking: may trigger on-chain refund — mobile-executed.
    case 'cancel_booking': {
      const bookingId = str(input, 'booking_id');
      const product = str(input, 'product_name');
      return `Cancel booking #${bookingId} (${product})`;
    }

    // create_purchase: one-shot TakumiPay purchase (no reserve step).
    case 'create_purchase': {
      const product = str(input, 'product_name');
      const price = str(input, 'price_formatted');
      return `Purchase ${product} for ${price}`;
    }

    default:
      return `Execute ${name}`;
  }
}
