import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GetWalletBalanceInputSchema, type GetWalletBalanceInput } from '../../blockchain/types/schemas';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import type { WalletService } from '../../blockchain/services/wallet.service';
import { transformError, createUnsupportedChainError, createMissingWalletError } from '../../blockchain/errors/error-transformer';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';

export const getWalletAddressTool: Tool = {
  name: 'get_wallet_address',
  description: 'Get the agent wallet address',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const getWalletBalanceTool: Tool = {
  name: 'get_wallet_balance',
  description: 'Get the native token balance of the agent wallet on a specific chain',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: { 
        type: 'number', 
        description: 'Chain ID (e.g., 1 for Ethereum mainnet)' 
      },
    },
    required: ['chainId'],
  },
};

export async function handleGetWalletAddress(
  walletService: WalletService | null,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    if (!walletService) {
      const error = createMissingWalletError();
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    const address = walletService.getAddress();

    return {
      content: [{ type: 'text', text: JSON.stringify({ address }) }],
    };
  } catch (error) {
    const blockchainError = transformError(error);
    return {
      content: [{ type: 'text', text: JSON.stringify(blockchainError) }],
      isError: true,
    };
  }
}


export async function handleGetWalletBalance(
  args: unknown,
  blockchainService: BlockchainService,
  walletService: WalletService | null,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: GetWalletBalanceInput = GetWalletBalanceInputSchema.parse(args);

    if (!walletService) {
      const error = createMissingWalletError();
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    if (!chainRegistry.isSupported(input.chainId)) {
      const error = createUnsupportedChainError(input.chainId);
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    const address = walletService.getAddress();

    const result = await blockchainService.getBalance(input.chainId, address);

    return {
      content: [{ type: 'text', text: JSON.stringify({ address, ...result }) }],
    };
  } catch (error) {
    const blockchainError = transformError(error);
    return {
      content: [{ type: 'text', text: JSON.stringify(blockchainError) }],
      isError: true,
    };
  }
}
