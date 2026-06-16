import { buildHumanSummary, truncateAddress } from './human-summary';
import { TOOL_REGISTRY } from './registry';

describe('buildHumanSummary', () => {
  it('estimate_gas → generic "Estimate gas" label with truncated recipient', () => {
    expect(
      buildHumanSummary('estimate_gas', {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bdef',
      }),
    ).toBe('Estimate gas for transfer to 0x742d…ef');
  });

  it('send_native_token → human amount from wei + truncated address', () => {
    expect(
      buildHumanSummary('send_native_token', {
        value_wei: 500000000000000000n, // 0.5 ETH
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bdef',
      }),
    ).toBe('Send 0.5 ETH to 0x742d…ef');
  });

  it('transfer_erc20 → amount + generic "tokens" label + truncated address', () => {
    expect(
      buildHumanSummary('transfer_erc20', {
        token_amount: '3',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bdef',
      }),
    ).toBe('Send 3 tokens to 0x742d…ef');
  });

  it('write_contract → backticked function name + short-truncated contract_address', () => {
    expect(
      buildHumanSummary('write_contract', {
        function_name: 'transfer',
        contract_address: '0xAbCdEf1234567890abcdef1234567890abcdef12',
      }),
    ).toBe('Call `transfer()` on 0xAbCd…');
  });

  it('approve_erc20 → truncated spender + human allowance', () => {
    expect(
      buildHumanSummary('approve_erc20', {
        spender: '0xDeFi2F1a3b4c5d6e7f8901234567890abcdef12ef',
        token_amount: '100',
      }),
    ).toBe('Approve 0xDeFi…ef to spend up to 100 tokens');
  });

  it('deposit_points → token amount + symbol + expected points', () => {
    expect(
      buildHumanSummary('deposit_points', {
        token_symbol: 'IDRX',
        token_amount: '100',
        expected_points: '1000',
      }),
    ).toBe('Deposit 100 IDRX for ~1000 points');
  });

  it('execute_redemption → product name + points cost', () => {
    expect(
      buildHumanSummary('execute_redemption', {
        product_name: 'Telkomsel 50K',
        points_cost: '5000',
      }),
    ).toBe('Redeem Telkomsel 50K for 5000 points');
  });

  it('request_authentication → static "Log in to TakumiPay" label', () => {
    expect(buildHumanSummary('request_authentication', {})).toBe(
      'Log in to TakumiPay',
    );
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
      'Estimate gas for transfer to ?',
    );

    // Missing `to` address on send_native_token falls back to "?".
    expect(() =>
      buildHumanSummary('send_native_token', {
        value_wei: '500000000000000000',
      }),
    ).not.toThrow();
    expect(
      buildHumanSummary('send_native_token', {
        value_wei: '500000000000000000',
      }),
    ).toBe('Send 0.5 ETH to ?');
  });

  it('covers every write tool in TOOL_REGISTRY with a non-default case', () => {
    // Regression guard: if someone adds a new write tool without
    // updating buildHumanSummary, this test fails. We detect a missed case
    // by checking that the output is NOT the default "Execute <name>" for an
    // empty input — every covered case starts with a different literal.
    const missing: string[] = [];
    for (const meta of Object.values(TOOL_REGISTRY)) {
      if (meta.capability !== 'write') {
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
