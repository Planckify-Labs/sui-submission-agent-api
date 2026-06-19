import {
  __resetModelCacheForTests,
  MODEL_IDS,
  ModelNotConfiguredError,
  resolveModel,
} from './models'

describe('agents/models registry', () => {
  const ORIGINAL = { ...process.env }

  beforeEach(() => {
    __resetModelCacheForTests()
    delete process.env.KIMI_K2_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  afterAll(() => {
    process.env = ORIGINAL
  })

  it('builds Kimi when KIMI_K2_API_KEY is set', () => {
    process.env.KIMI_K2_API_KEY = 'sk-test'
    const model = resolveModel(MODEL_IDS.KIMI_K2)
    expect(model).toBeDefined()
    // ai SDK model exposes a provider tag.
    expect(String((model as { provider?: string }).provider)).toMatch(/openai/i)
  })

  it('builds Claude when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    const model = resolveModel(MODEL_IDS.CLAUDE_SONNET)
    expect(String((model as { modelId?: string }).modelId)).toContain('claude')
  })

  it('throws ModelNotConfiguredError when the provider key is missing', () => {
    expect(() => resolveModel(MODEL_IDS.KIMI_K2)).toThrow(ModelNotConfiguredError)
  })

  it('throws ModelNotConfiguredError for an unknown id', () => {
    expect(() => resolveModel('nope' as never)).toThrow(ModelNotConfiguredError)
  })

  it('caches: the same id returns the same instance', () => {
    process.env.KIMI_K2_API_KEY = 'sk-test'
    expect(resolveModel(MODEL_IDS.KIMI_K2)).toBe(resolveModel(MODEL_IDS.KIMI_K2))
  })
})
