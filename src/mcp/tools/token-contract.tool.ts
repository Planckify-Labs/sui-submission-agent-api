import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TakumiPayService } from '../../takumipay';
import type { ToolResponse } from './index';
import { ERC20_ABI } from '../../constants/erc20-abi';

export const searchTokensTool: Tool = {
  name: 'takumipay_search_tokens',
  description: 'Search for supported tokens with optional filters. Use this to find payment tokens available on specific blockchains or to filter by stablecoin status.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Filter by token symbol (e.g., "USDT", "USDC") - case-insensitive',
      },
      name: {
        type: 'string',
        description: 'Filter by token name (partial match, case-insensitive)',
      },
      blockchainId: {
        type: 'string',
        description: 'Filter by blockchain ID',
      },
      isStablecoin: {
        type: 'boolean',
        description: 'Filter by stablecoin status (true for stablecoins only)',
      },
      isActive: {
        type: 'boolean',
        description: 'Filter by active status (default: true)',
      },
    },
    required: [],
  },
};

export const getTokenTool: Tool = {
  name: 'takumipay_get_token',
  description: 'Get detailed information about a specific token by its ID. Returns token name, symbol, decimals, contract address, and blockchain information.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The token ID',
      },
    },
    required: ['id'],
  },
};


export const getPaymentContractTool: Tool = {
  name: 'takumipay_get_payment_contract',
  description: 'Get the TakumiPay smart contract details for a specific blockchain by chain ID. Returns the contract address, blockchain information, and ABI needed for payment processing.',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: {
        type: 'number',
        description: 'The blockchain chain ID (e.g., 1 for Ethereum mainnet, 137 for Polygon)',
      },
    },
    required: ['chainId'],
  },
};

export const getErc20AbiTool: Tool = {
  name: 'takumipay_get_erc20_abi',
  description: 'Get the standard ERC20 ABI for interacting with any ERC20 token contract. Use this for balance checks, transfers, and approvals.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const tokenContractTools: Tool[] = [
  searchTokensTool,
  getTokenTool,
  getPaymentContractTool,
  getErc20AbiTool,
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

export async function handleSearchTokens(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { symbol, name, blockchainId, isStablecoin, isActive } = (args as {
      symbol?: string;
      name?: string;
      blockchainId?: string;
      isStablecoin?: boolean;
      isActive?: boolean;
    }) ?? {};
    
    const tokens = await takumiPayService.searchTokens({
      symbol,
      name,
      blockchainId,
      isStablecoin,
      isActive,
    });
    
    return createSuccessResponse({ count: tokens.length, tokens });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetToken(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { id } = args as { id: string };
    
    if (!id) {
      return createErrorResponse(new Error('Token ID is required'));
    }
    
    const token = await takumiPayService.getTokenById(id);
    return createSuccessResponse(token);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetPaymentContract(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { chainId } = args as { chainId: number };
    
    if (chainId === undefined || chainId === null) {
      return createErrorResponse(new Error('Chain ID is required'));
    }
    
    const contract = await takumiPayService.getSmartContractByChainId(chainId);
    return createSuccessResponse(contract);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetErc20Abi(): Promise<ToolResponse> {
  return {
    content: [{ type: 'text', text: JSON.stringify({ abi: ERC20_ABI }, null, 2) }],
  };
}

export function createTokenContractToolHandlers(
  takumiPayService: TakumiPayService,
): Map<string, (args: unknown) => Promise<ToolResponse>> {
  const handlers = new Map<string, (args: unknown) => Promise<ToolResponse>>();

  handlers.set('takumipay_search_tokens', (args) =>
    handleSearchTokens(args, takumiPayService),
  );

  handlers.set('takumipay_get_token', (args) =>
    handleGetToken(args, takumiPayService),
  );

  handlers.set('takumipay_get_payment_contract', (args) =>
    handleGetPaymentContract(args, takumiPayService),
  );

  handlers.set('takumipay_get_erc20_abi', () =>
    handleGetErc20Abi(),
  );

  return handlers;
}
