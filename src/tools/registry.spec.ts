import {
  TOOL_REGISTRY,
  ToolCapability,
  ToolCategory,
  ToolExecutor,
  ToolMeta,
} from './registry';

describe('TOOL_REGISTRY', () => {
  const entries = Object.entries(TOOL_REGISTRY);

  it('is non-empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('has a map key that matches every entry.name', () => {
    for (const [key, meta] of entries) {
      expect(meta.name).toBe(key);
    }
  });

  it('every entry has name, category, executor, capability, description', () => {
    // This is the acceptance-criterion check from the task spec.
    expect(
      Object.values(TOOL_REGISTRY).every(
        (t) =>
          !!t.name && !!t.category && !!t.executor && !!t.capability && !!t.description,
      ),
    ).toBe(true);

    // Individual assertions for easier debugging if the above fails.
    for (const meta of Object.values(TOOL_REGISTRY)) {
      expect(typeof meta.name).toBe('string');
      expect(meta.name.length).toBeGreaterThan(0);
      expect(typeof meta.category).toBe('string');
      expect(meta.category.length).toBeGreaterThan(0);
      expect(typeof meta.executor).toBe('string');
      expect(meta.executor.length).toBeGreaterThan(0);
      expect(typeof meta.capability).toBe('string');
      expect(meta.capability.length).toBeGreaterThan(0);
      expect(typeof meta.description).toBe('string');
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it('every blockchain_* entry has executor "mobile"', () => {
    const blockchainEntries = Object.values(TOOL_REGISTRY).filter((t) =>
      t.category.startsWith('blockchain_'),
    );
    expect(blockchainEntries.length).toBeGreaterThan(0);
    for (const meta of blockchainEntries) {
      expect(meta.executor).toBe('mobile');
    }
  });

  it('uses only valid enum values for category / executor / capability', () => {
    const validCategories: ToolCategory[] = [
      'blockchain_read',
      'blockchain_write',
      'points',
      'utility',
    ];
    const validExecutors: ToolExecutor[] = ['server', 'mobile'];
    const validCapabilities: ToolCapability[] = ['read', 'simulate', 'write'];

    for (const meta of Object.values(TOOL_REGISTRY)) {
      expect(validCategories).toContain(meta.category);
      expect(validExecutors).toContain(meta.executor);
      expect(validCapabilities).toContain(meta.capability);
    }
  });

  it('every mobile tool has a concrete (non-stub) inputSchema', () => {
    const mobileTools = Object.values(TOOL_REGISTRY).filter(
      (t) => t.executor === 'mobile',
    );
    expect(mobileTools.length).toBeGreaterThan(0);

    for (const meta of mobileTools) {
      expect(meta.inputSchema).toBeDefined();
      const schema = meta.inputSchema!;
      expect(schema.type).toBe('object');
      expect(Array.isArray(schema.required)).toBe(true);
      expect(typeof schema.properties).toBe('object');
      // A "stub" looked like { properties: {}, additionalProperties: true }
      // with no `required` entries. Non-chain-specific reads (e.g.
      // get_wallet_address, get_supported_chains) legitimately have
      // `required: []` and empty properties, so instead of banning both,
      // we ban the stub combo: open + permissive + empty.
      const isStub =
        Object.keys(schema.properties).length === 0 &&
        schema.additionalProperties === true;
      expect(isStub).toBe(false);
    }
  });

  it('every multi-chain mobile tool requires chain_id', () => {
    const multiChainTools = [
      'get_balance',
      'get_wallet_balance',
      'read_contract',
      'get_transaction',
      'estimate_gas',
      'send_native_token',
      'transfer_erc20',
      'write_contract',
      'approve_erc20',
    ];
    for (const name of multiChainTools) {
      const meta = TOOL_REGISTRY[name];
      expect(meta).toBeDefined();
      expect(meta.inputSchema).toBeDefined();
      const schema = meta.inputSchema!;
      expect(schema.required).toContain('chain_id');
      expect(schema.properties.chain_id).toBeDefined();
      expect(schema.properties.chain_id.type).toBe('integer');
    }
  });

  it('wei amount fields are typed as base-10 strings', () => {
    const weiFields: Array<[string, string]> = [
      ['send_native_token', 'value_wei'],
      ['estimate_gas', 'value_wei'],
    ];
    for (const [toolName, field] of weiFields) {
      const prop = TOOL_REGISTRY[toolName].inputSchema!.properties[field];
      expect(prop).toBeDefined();
      expect(prop.type).toBe('string');
      expect(prop.pattern).toBe('^[0-9]+$');
    }
  });

  it('transfer_erc20 and approve_erc20 accept human-readable amount fields', () => {
    for (const toolName of ['transfer_erc20', 'approve_erc20']) {
      const schema = TOOL_REGISTRY[toolName].inputSchema!;
      // Preferred human-readable path
      expect(schema.properties.token_amount).toBeDefined();
      expect(schema.properties.token_amount.type).toBe('string');
      expect(schema.properties.token_decimals).toBeDefined();
      expect(schema.properties.token_decimals.type).toBe('integer');
      // Both required
      expect(schema.required).toContain('token_amount');
      expect(schema.required).toContain('token_decimals');
      // Fallback amount_wei field still present
      expect(schema.properties.amount_wei).toBeDefined();
    }
  });

  it('address fields enforce the 0x40-hex pattern', () => {
    const addrFields: Array<[string, string]> = [
      ['send_native_token', 'to'],
      ['transfer_erc20', 'to'],
      ['transfer_erc20', 'contract_address'],
      ['approve_erc20', 'spender'],
      ['approve_erc20', 'contract_address'],
      ['read_contract', 'contract_address'],
      ['write_contract', 'contract_address'],
      ['estimate_gas', 'to'],
    ];
    for (const [toolName, field] of addrFields) {
      const prop = TOOL_REGISTRY[toolName].inputSchema!.properties[field];
      expect(prop).toBeDefined();
      expect(prop.type).toBe('string');
      expect(prop.pattern).toBe('^0x[0-9a-fA-F]{40}$');
    }
  });

  it('tools with no chain-specific inputs have required: []', () => {
    for (const name of ['get_wallet_address', 'get_supported_chains']) {
      const schema = TOOL_REGISTRY[name].inputSchema!;
      expect(schema.required).toEqual([]);
    }
  });

  it('contains all required tools with the exact executor / capability from the task spec', () => {
    const expected: Array<
      Pick<ToolMeta, 'name' | 'category' | 'executor' | 'capability'>
    > = [
      // Mobile / blockchain_read — read
      { name: 'get_balance', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'get_wallet_balance', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'read_contract', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'get_transaction', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'get_wallet_address', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'get_supported_chains', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'get_wallet_tokens', category: 'blockchain_read', executor: 'mobile', capability: 'read' },

      // Mobile / blockchain_read — simulate
      { name: 'estimate_gas', category: 'blockchain_read', executor: 'mobile', capability: 'simulate' },

      // Mobile / blockchain_write — write
      { name: 'send_native_token', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
      { name: 'transfer_erc20', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
      { name: 'write_contract', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
      { name: 'approve_erc20', category: 'blockchain_write', executor: 'mobile', capability: 'write' },

      // Mobile / points — read
      { name: 'get_redemption_categories', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_redemption_catalog', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'search_redemption_catalog', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_product_details', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_product_input_fields', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_points_price', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_points_balance', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_points_history', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_redemption_status', category: 'points', executor: 'mobile', capability: 'read' },
      { name: 'get_redemption_history', category: 'points', executor: 'mobile', capability: 'read' },

      // Mobile / points — write
      { name: 'deposit_points', category: 'points', executor: 'mobile', capability: 'write' },
      { name: 'execute_redemption', category: 'points', executor: 'mobile', capability: 'write' },

      // Mobile / points — simulate
      { name: 'request_authentication', category: 'points', executor: 'mobile', capability: 'simulate' },

      // Mobile / utility (address book) — read
      { name: 'get_address_book', category: 'utility', executor: 'mobile', capability: 'read' },
      { name: 'get_address_book_entry', category: 'utility', executor: 'mobile', capability: 'read' },
      { name: 'search_address_book', category: 'utility', executor: 'mobile', capability: 'read' },

      // Mobile / blockchain_read — Solana native
      { name: 'get_wallet_sol_balance', category: 'blockchain_read', executor: 'mobile', capability: 'read' },
      { name: 'get_sol_balance', category: 'blockchain_read', executor: 'mobile', capability: 'read' },

      // Mobile / blockchain_write — Solana native
      { name: 'send_sol', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
    ];

    for (const expectedMeta of expected) {
      const actual = TOOL_REGISTRY[expectedMeta.name];
      expect(actual).toBeDefined();
      expect(actual.category).toBe(expectedMeta.category);
      expect(actual.executor).toBe(expectedMeta.executor);
      expect(actual.capability).toBe(expectedMeta.capability);
    }
  });
});
