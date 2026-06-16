export type ToolExecutor = 'server' | 'mobile';
export type ToolCapability = 'read' | 'write';
export type ToolCategory =
  | 'blockchain_read'
  | 'blockchain_write'
  | 'points'
  | 'utility';

/**
 * Minimal JSON-Schema shape used for mobile tool input descriptions.
 *
 * This is a subset of Draft-07 and purposefully typed loosely so the
 * per-tool schemas below read like plain JSON. `buildAllTools` in
 * `chat.service.ts` wraps these in the `ai` SDK's `jsonSchema()` helper
 * before passing them to the LLM.
 */
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  pattern?: string;
  enum?: Array<string | number>;
  minimum?: number;
  items?: JsonSchemaProperty | { type: string };
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | { type: string };
  oneOf?: JsonSchemaProperty[];
}

export interface ToolMeta {
  name: string;
  category: ToolCategory;
  executor: ToolExecutor;
  capability: ToolCapability;
  description: string;
  /**
   * Concrete JSON Schema for this tool's input. Required for every
   * mobile tool per protocol v1.1 §3 — the LLM has no other signal
   * about which parameters are mandatory. Server-executor tools may
   * omit this because the MCP client publishes its own schemas.
   */
  inputSchema?: JsonSchemaObject;
  /**
   * Marks this tool as x402-backed (x402-extensibility-spec §6.2, G3):
   * its call is resolved against the catalog entry `resourceId` and
   * settled through the same mobile `x402_fetch` machinery. Absent ⇒ a
   * normal tool. "Some tools have it, some don't."
   */
  x402?: { resourceId: string };
}
