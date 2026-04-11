/**
 * MCP subprocess tool handler registry.
 *
 * Post protocol v1.1 §11: the MCP subprocess is a bare template. All
 * blockchain and points/redemption tools execute on the mobile client
 * via the mobile-executor protocol, not here. This factory only exists
 * so the subprocess can wire additional diagnostic / server-local tools
 * in the future without re-plumbing the server bootstrap.
 */

export type ToolResponse = {
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
};

export type ToolHandler = (args: unknown) => Promise<ToolResponse>;

/**
 * Build the MCP subprocess' dynamic tool handler map.
 *
 * Currently empty — the `owner` and `calculator` legacy tools in
 * `src/mcp/server.ts` are handled inline there. This factory is retained
 * as an extension point for future server-local tools that legitimately
 * need to run in the subprocess (non-blockchain, non-user-credential).
 */
export function createToolHandlers(): Map<string, ToolHandler> {
  return new Map<string, ToolHandler>();
}
