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
      'takumipay',
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

      // Mobile / blockchain_read — simulate
      { name: 'estimate_gas', category: 'blockchain_read', executor: 'mobile', capability: 'simulate' },

      // Mobile / blockchain_write — write
      { name: 'send_native_token', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
      { name: 'transfer_erc20', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
      { name: 'write_contract', category: 'blockchain_write', executor: 'mobile', capability: 'write' },
      { name: 'approve_erc20', category: 'blockchain_write', executor: 'mobile', capability: 'write' },

      // Server / takumipay — read
      { name: 'get_products', category: 'takumipay', executor: 'server', capability: 'read' },
      { name: 'search_products', category: 'takumipay', executor: 'server', capability: 'read' },
      { name: 'get_product_prices', category: 'takumipay', executor: 'server', capability: 'read' },
      { name: 'get_latest_exchange_rate', category: 'takumipay', executor: 'server', capability: 'read' },

      // Server / takumipay — simulate
      { name: 'create_booking', category: 'takumipay', executor: 'server', capability: 'simulate' },

      // Mobile / takumipay — write
      { name: 'execute_booking', category: 'takumipay', executor: 'mobile', capability: 'write' },
      { name: 'cancel_booking', category: 'takumipay', executor: 'mobile', capability: 'write' },
      { name: 'create_purchase', category: 'takumipay', executor: 'mobile', capability: 'write' },
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
