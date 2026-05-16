import {
  AGENT_SYSTEM_PROMPT,
  buildSystemPrompt,
  buildWalletContextPrompt,
  type WalletContext,
} from './system-prompt';

describe('AGENT_SYSTEM_PROMPT', () => {
  it('contains the Objectives section phrasing', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('### Objectives');
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Help users manage crypto assets, points, and redemptions safely',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Never execute irreversible actions without user approval',
    );
  });

  it('contains the Chain awareness rule forbidding invented chain_ids', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('### Chain awareness');
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'NEVER invent or assume a chain_id',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('get_supported_chains');
  });

  it('contains the Pre-conditions enforcing the write sequence', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(
      '### Pre-conditions (must verify before acting)',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'EVM (eip155): ALWAYS call `get_wallet_balance` (native) AND `get_wallet_tokens` with `include_balance: true` (tokens) before transfers.',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Solana (solana): ALWAYS call `get_wallet_sol_balance` (native) AND `get_wallet_spl_tokens` with `include_balance: true` (tokens) before transfers.',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Sui (sui): ALWAYS call `get_wallet_sui_balance` (native) AND `get_wallet_sui_coins` with `include_balance: true` (tokens) before transfers.',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'ONLY call `estimate_gas` on EVM when using the low-level `write_contract` tool.',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'ALWAYS call `get_points_balance` before `execute_redemption`',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('NEVER assume wallet state');
  });

  it('contains the Privacy rules about seed phrases', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('### Privacy');
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'You do NOT have access to the private key or seed phrase',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('never share these with anyone');
  });

  it('contains the Decision-making guidance', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('### Decision-making');
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Prefer the fewest tool calls to accomplish the goal',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'ask for clarification before calling any tool',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('do not retry blindly');
  });

  it('contains the Honesty rules', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('### Honesty');
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Never hallucinate balances or conversion rates',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain(
      'Report errors to the user in plain language',
    );
    expect(AGENT_SYSTEM_PROMPT).toContain('If a service is unavailable');
  });
});

describe('buildWalletContextPrompt', () => {
  const fullCtx: WalletContext = {
    address: '0xabc0000000000000000000000000000000000001',
    label: 'Main',
    chain_id: 8453,
    chain_name: 'Base',
    chain_symbol: 'ETH',
  };

  it('renders address, parenthesized label, chain_name, chain_symbol, and chain_id', () => {
    const prompt = buildWalletContextPrompt(fullCtx);
    expect(prompt).toContain('## Connected Wallet');
    expect(prompt).toContain(
      'Address: 0xabc0000000000000000000000000000000000001 (Main)',
    );
    expect(prompt).toContain('Active chain: Base (ETH, chain_id: 8453)');
    expect(prompt).toContain(
      'All onchain actions are executed by the mobile app.',
    );
    expect(prompt).toContain('get_supported_chains');
  });

  it('omits the parenthesized label entirely when label is undefined', () => {
    const ctx: WalletContext = {
      address: '0xdef0000000000000000000000000000000000002',
      chain_id: 1,
      chain_name: 'Ethereum',
      chain_symbol: 'ETH',
    };
    const prompt = buildWalletContextPrompt(ctx);
    expect(prompt).toContain(
      'Address: 0xdef0000000000000000000000000000000000002',
    );
    // No empty parens and no trailing "(" on the address line.
    expect(prompt).not.toContain('()');
    expect(prompt).not.toMatch(
      /Address: 0xdef0000000000000000000000000000000000002 \(/,
    );
  });

  it('starts with "## Connected Wallet" after trimming leading whitespace', () => {
    const prompt = buildWalletContextPrompt(fullCtx);
    expect(prompt.startsWith('## Connected Wallet')).toBe(true);
    // trim() also strips the trailing newline.
    expect(prompt.endsWith('\n')).toBe(false);
  });

  it('renders the unauthenticated points-service line when points_authenticated is absent', () => {
    const prompt = buildWalletContextPrompt(fullCtx);
    expect(prompt).toContain('Points service: NOT authenticated');
    expect(prompt).toContain('request_authentication');
    expect(prompt).not.toContain('Points service: authenticated —');
  });

  it('renders the unauthenticated points-service line when points_authenticated is false', () => {
    const prompt = buildWalletContextPrompt({
      ...fullCtx,
      points_authenticated: false,
    });
    expect(prompt).toContain('Points service: NOT authenticated');
    expect(prompt).toContain('request_authentication');
  });

  it('renders the authenticated points-service line when points_authenticated is true', () => {
    const prompt = buildWalletContextPrompt({
      ...fullCtx,
      points_authenticated: true,
    });
    expect(prompt).toContain(
      'Points service: authenticated — you MAY call auth-required points and redemption tools directly.',
    );
    expect(prompt).not.toContain('Points service: NOT authenticated');
    expect(prompt).not.toContain('request_authentication');
  });
});

describe('buildSystemPrompt', () => {
  const ctx: WalletContext = {
    address: '0xabc0000000000000000000000000000000000001',
    label: 'Main',
    chain_id: 8453,
    chain_name: 'Base',
    chain_symbol: 'ETH',
  };

  it('returns wallet context followed by two newlines and the rules block, in that order', () => {
    const walletBlock = buildWalletContextPrompt(ctx);
    const full = buildSystemPrompt(ctx);
    expect(full).toBe(walletBlock + '\n\n' + AGENT_SYSTEM_PROMPT);
    // Wallet context must appear before the Agent Rules header.
    const walletIdx = full.indexOf('## Connected Wallet');
    const rulesIdx = full.indexOf('## Agent Rules');
    expect(walletIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(walletIdx);
    // The separator between them is exactly "\n\n".
    const between = full.slice(walletIdx + walletBlock.length, rulesIdx);
    expect(between).toBe('\n\n');
  });
});
