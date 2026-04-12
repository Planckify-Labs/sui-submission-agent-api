import type { ModelMessage } from 'ai'

const SENSITIVE_FIELD_NAMES = new Set([
  'voucher_code',
  'private_key',
  'seed_phrase',
  'mnemonic',
  'password',
  'secret',
  'pin',
  'otp',
])

function redactDeep(obj: unknown, fields: Set<string>): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((item) => redactDeep(item, fields))
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = fields.has(key) ? '[REDACTED]' : redactDeep(value, fields)
  }
  return result
}

export function sanitizeMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'tool') return msg
    return redactDeep(structuredClone(msg), SENSITIVE_FIELD_NAMES) as ModelMessage
  })
}
