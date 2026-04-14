import { z } from 'zod'

/**
 * Zod schemas for the `/chat` and `/chat/respond` request bodies.
 * These live separate from the controller so tests can import them too.
 */

/**
 * Wallet context injected by mobile when starting a new turn. See §8.2.
 * Mirrors `WalletContext` in `src/session/types.ts`; kept here as a Zod
 * schema so the controller can validate without a runtime import cycle.
 */
const hexAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/) as z.ZodType<
  `0x${string}`
>

export const walletContextSchema = z.object({
  address: hexAddressSchema,
  chain_id: z.number().int().positive(),
  chain_name: z.string().min(1),
  chain_symbol: z.string().min(1),
  label: z.string().optional(),
  // v1.1 (§13): whether the mobile currently holds a non-expired
  // points-service JWT for this wallet. Optional for backwards
  // compatibility with pre-v1.1 mobile clients.
  points_authenticated: z.boolean().optional(),
})

/**
 * `POST /chat` body — accepts both new-turn requests and reconnect requests.
 * Reconnect is detected by `session_id` set + `messages` empty.
 *
 * `wallet_context` is required on the *first* turn (no session, or an
 * expired one). Subsequent turns may omit it since the session already
 * carries the wallet binding.
 */
export const chatRequestSchema = z.object({
  messages: z.array(z.any()).default([]),
  session_id: z.string().optional(),
  wallet_context: walletContextSchema.optional(),
  conversation_id: z.string().uuid().optional(),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

/**
 * `POST /chat/respond` body — discriminated union per AGENT_PROTOCOL §8.4.
 */
const hexStringSchema = z.string().regex(/^0x[0-9a-fA-F]*$/) as z.ZodType<
  `0x${string}`
>

export const toolResultPayloadSchema = z.object({
  status: z.enum(['success', 'failed']),
  tx_hash: hexStringSchema.optional(),
  tx_confirmed: z.boolean().optional(),
  data: z.unknown().optional(),
  error: z.string().optional(),
})

export const toolResultBodySchema = z.object({
  type: z.literal('tool_result'),
  session_id: z.string().min(1),
  tool_call_id: z.string().min(1),
  result: toolResultPayloadSchema,
})

export const toolRejectedBodySchema = z.object({
  type: z.literal('tool_rejected'),
  session_id: z.string().min(1),
  tool_call_id: z.string().min(1),
  // Known reasons listed in the protocol, but we accept any string for
  // forward-compatibility (§8.4).
  reason: z.string().min(1),
})

export const mobileResponseSchema = z.discriminatedUnion('type', [
  toolResultBodySchema,
  toolRejectedBodySchema,
])

export type MobileResponseBody = z.infer<typeof mobileResponseSchema>

/**
 * `POST /chat/progress` body — mobile fires this after a tool has been
 * pending for ~3s on the device. The server answers by emitting a
 * natural-voice "please wait" message on the still-open SSE stream.
 * See AGENT_PROTOCOL.md §8.5.
 */
export const progressRequestSchema = z.object({
  session_id: z.string().min(1),
  tool_call_id: z.string().min(1),
  reason: z.string().optional(),
})

export type ProgressRequestBody = z.infer<typeof progressRequestSchema>
