import { buildHumanSummary, truncateAddress } from './human-summary';
import { TOOL_REGISTRY } from './registry';

describe('buildHumanSummary', () => {
  it('estimate_gas → pre-formatted ETH + USD string', () => {
    expect(
      buildHumanSummary('estimate_gas', {
        eth_amount: '0.002',
        usd_amount: '3.20',
      }),
    ).toBe('Gas estimate: ~0.002 ETH ($3.20)');
  });

  it('send_native_token → human amount + truncated address + chain', () => {
    expect(
      buildHumanSummary('send_native_token', {
        amount: '0.5',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bdef',
        chain_name: 'Polygon',
      }),
    ).toBe('Send 0.5 ETH to 0x742d…ef on Polygon');
  });

  it('transfer_erc20 → amount + symbol + truncated address + chain', () => {
    expect(
      buildHumanSummary('transfer_erc20', {
        amount: '3',
        symbol: 'USDT',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bdef',
        chain_name: 'Polygon',
      }),
    ).toBe('Send 3 USDT to 0x742d…ef on Polygon');
  });

  it('write_contract → backticked function name + short-truncated address', () => {
    expect(
      buildHumanSummary('write_contract', {
        function_name: 'transfer',
        address: '0xAbCdEf1234567890abcdef1234567890abcdef12',
      }),
    ).toBe('Call `transfer()` on 0xAbCd…');
  });

  it('approve_erc20 → truncated spender + human allowance + symbol', () => {
    expect(
      buildHumanSummary('approve_erc20', {
        spender: '0xDeFi2F1a3b4c5d6e7f8901234567890abcdef12ef',
        amount: '100',
        symbol: 'USDC',
      }),
    ).toBe('Approve 0xDeFi…ef to spend up to 100 USDC');
  });

  it('create_booking → preview line with product and formatted price', () => {
    expect(
      buildHumanSummary('create_booking', {
        product_name: 'Telkomsel 50K',
        price_formatted: 'Rp 50.000',
      }),
    ).toBe('Preview: Telkomsel 50K — Rp 50.000 (not yet executed)');
  });

  it('execute_booking → payment line with product and booking id', () => {
    expect(
      buildHumanSummary('execute_booking', {
        price_formatted: 'Rp 50.000',
        product_name: 'Telkomsel 50K',
        booking_id: 'BK-4821',
      }),
    ).toBe('Pay Rp 50.000 for Telkomsel 50K (booking #BK-4821)');
  });

  it('cancel_booking → cancellation line with booking id and product', () => {
    expect(
      buildHumanSummary('cancel_booking', {
        booking_id: 'BK-4821',
        product_name: 'Telkomsel 50K',
      }),
    ).toBe('Cancel booking #BK-4821 (Telkomsel 50K)');
  });

  it('create_purchase → purchase line with product and formatted price', () => {
    expect(
      buildHumanSummary('create_purchase', {
        product_name: 'Telkomsel 50K',
        price_formatted: 'Rp 50.000',
      }),
    ).toBe('Purchase Telkomsel 50K for Rp 50.000');
  });

  it('default branch → "Execute <name>" for unknown tools', () => {
    expect(buildHumanSummary('unknown_tool', {})).toBe('Execute unknown_tool');
  });

  it('missing optional fields fall back to "?" without throwing', () => {
    // No fields at all — should not throw and should contain the "?" marker.
    expect(() =>
      buildHumanSummary('estimate_gas', {}),
    ).not.toThrow();
    expect(buildHumanSummary('estimate_gas', {})).toBe(
      'Gas estimate: ~? ETH ($?)',
    );

    // Missing `to` address on send_native_token falls back to "?".
    expect(() =>
      buildHumanSummary('send_native_token', {
        amount: '0.5',
        chain_name: 'Polygon',
      }),
    ).not.toThrow();
    expect(
      buildHumanSummary('send_native_token', {
        amount: '0.5',
        chain_name: 'Polygon',
      }),
    ).toBe('Send 0.5 ETH to ? on Polygon');
  });

  it('covers every simulate/write tool in TOOL_REGISTRY with a non-default case', () => {
    // Regression guard: if someone adds a new simulate/write tool without
    // updating buildHumanSummary, this test fails. We detect a missed case
    // by checking that the output is NOT the default "Execute <name>" for an
    // empty input — every covered case starts with a different literal.
    const missing: string[] = [];
    for (const meta of Object.values(TOOL_REGISTRY)) {
      if (meta.capability !== 'simulate' && meta.capability !== 'write') {
        continue;
      }
      const out = buildHumanSummary(meta.name, {});
      if (out === `Execute ${meta.name}`) {
        missing.push(meta.name);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('truncateAddress', () => {
  it('formats a full EVM address as first 6 + … + last 2', () => {
    expect(
      truncateAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bdef'),
    ).toBe('0x742d…ef');
  });

  it('returns "?" for non-string or empty input', () => {
    expect(truncateAddress(undefined)).toBe('?');
    expect(truncateAddress(null)).toBe('?');
    expect(truncateAddress(123)).toBe('?');
    expect(truncateAddress('')).toBe('?');
  });

  it('returns the input as-is when it is too short to truncate', () => {
    // 6-char and 8-char inputs are below the truncation threshold.
    expect(truncateAddress('0x1234')).toBe('0x1234');
    expect(truncateAddress('0x123456')).toBe('0x123456');
  });
});
