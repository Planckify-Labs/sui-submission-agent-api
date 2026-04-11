import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TakumiPayService } from '../../takumipay';

import { takumiPayProductTools, createTakumiPayToolHandlers } from './products.tool';
import { exchangeRateTools, createExchangeRateToolHandlers } from './exchange-rate.tool';
import { tokenContractTools, createTokenContractToolHandlers } from './token-contract.tool';

export { takumiPayProductTools, createTakumiPayToolHandlers };
export { exchangeRateTools, createExchangeRateToolHandlers };
export { tokenContractTools, createTokenContractToolHandlers };

export type ToolResponse = {
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
};

export type ToolHandler = (
  args: unknown,
  services: {
    takumiPayService?: TakumiPayService | null;
  },
) => Promise<ToolResponse>;

/**
 * TakumiPay-only tool set exposed via the internal MCP subprocess.
 *
 * All blockchain / wallet tools have been moved to the mobile executor
 * (see `src/tools/registry.ts` and the agent loop in `src/chat.service.ts`).
 * The MCP subprocess only serves off-chain TakumiPay tools now.
 */
export function createToolHandlers(services: {
  takumiPayService?: TakumiPayService | null;
}): Map<string, (args: unknown) => Promise<ToolResponse>> {
  const { takumiPayService } = services;

  const handlers = new Map<string, (args: unknown) => Promise<ToolResponse>>();

  if (takumiPayService) {
    const takumiPayHandlers = createTakumiPayToolHandlers(takumiPayService);
    for (const [name, handler] of takumiPayHandlers) {
      handlers.set(name, handler);
    }

    const exchangeRateHandlers = createExchangeRateToolHandlers(takumiPayService);
    for (const [name, handler] of exchangeRateHandlers) {
      handlers.set(name, handler);
    }

    const tokenContractHandlers = createTokenContractToolHandlers(takumiPayService);
    for (const [name, handler] of tokenContractHandlers) {
      handlers.set(name, handler);
    }
  }

  return handlers;
}

export {
  transformResponse,
  createTransformedResponse,
  setToolConfig,
  getToolConfig,
  addGlobalExclusions,
  getResponseStats,
  type ResponseProfile,
  type FieldConfig,
  type ToolResponseConfig,
} from './response-transformer';
