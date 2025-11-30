import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TakumiPayService } from '../../takumipay';
import type { ToolResponse } from './index';

export const getLatestExchangeRateTool: Tool = {
  name: 'takumipay_get_latest_exchange_rate',
  description: 'Get the latest exchange rate between two currencies. Use this to fetch current exchange rates for pricing information and to get the exchange rate ID needed for booking creation.',
  inputSchema: {
    type: 'object',
    properties: {
      fromCurrency: {
        type: 'string',
        description: 'Source currency code (e.g., "USDT")',
      },
      toCurrency: {
        type: 'string',
        description: 'Target currency code (e.g., "IDR")',
      },
    },
    required: [],
  },
};

export const getExchangeRateByIdTool: Tool = {
  name: 'takumipay_get_exchange_rate_by_id',
  description: 'Get a specific exchange rate by its ID. Use this to retrieve a locked rate for booking operations.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'The exchange rate ID',
      },
    },
    required: ['id'],
  },
};

export const exchangeRateTools: Tool[] = [
  getLatestExchangeRateTool,
  getExchangeRateByIdTool,
];

function createSuccessResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export async function handleGetLatestExchangeRate(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { fromCurrency, toCurrency } = (args as { fromCurrency?: string; toCurrency?: string }) ?? {};
    const exchangeRate = await takumiPayService.getLatestExchangeRate({ fromCurrency, toCurrency });
    return createSuccessResponse(exchangeRate);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetExchangeRateById(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { id } = args as { id: number };
    if (id === undefined || id === null) {
      return createErrorResponse(new Error('Exchange rate ID is required'));
    }
    const exchangeRate = await takumiPayService.getExchangeRateById(id);
    return createSuccessResponse(exchangeRate);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export function createExchangeRateToolHandlers(
  takumiPayService: TakumiPayService,
): Map<string, (args: unknown) => Promise<ToolResponse>> {
  const handlers = new Map<string, (args: unknown) => Promise<ToolResponse>>();

  handlers.set('takumipay_get_latest_exchange_rate', (args) =>
    handleGetLatestExchangeRate(args, takumiPayService),
  );

  handlers.set('takumipay_get_exchange_rate_by_id', (args) =>
    handleGetExchangeRateById(args, takumiPayService),
  );

  return handlers;
}
