import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Address } from 'viem';
import { GetBalanceInputSchema, type GetBalanceInput } from '../../blockchain/types/schemas';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import type { WalletService } from '../../blockchain/services/wallet.service';
import { transformError, createUnsupportedChainError, createMissingWalletError } from '../../blockchain/errors/error-transformer';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';

export const getBalanceTool: Tool = {
  name: 'get_balance',
  description: 'Get native token balance for an address on a specific chain. If no address is provided, uses the connected agent wallet address.',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: { 
        type: 'number', 
        description: 'Chain ID (e.g., 1 for Ethereum mainnet)' 
      },
      address: { 
        type: 'string', 
        description: 'Wallet address to check balance (optional - defaults to agent wallet)' 
      },
    },
    required: ['chainId'],
  },
};

export async function handleGetBalance(
  args: unknown,
  blockchainService: BlockchainService,
  walletService: WalletService | null,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: GetBalanceInput = GetBalanceInputSchema.parse(args);

    if (!chainRegistry.isSupported(input.chainId)) {
      const error = createUnsupportedChainError(input.chainId);
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    let targetAddress: Address;
    if (input.address) {
      targetAddress = input.address as Address;
    } else {
      if (!walletService) {
        const error = createMissingWalletError();
        return {
          content: [{ type: 'text', text: JSON.stringify(error) }],
          isError: true,
        };
      }
      targetAddress = walletService.getAddress();
    }

    const result = await blockchainService.getBalance(
      input.chainId,
      targetAddress,
    );

    return {
      content: [{ type: 'text', text: JSON.stringify({ address: targetAddress, ...result }) }],
    };
  } catch (error) {
    const blockchainError = transformError(error);
    return {
      content: [{ type: 'text', text: JSON.stringify(blockchainError) }],
      isError: true,
    };
  }
}
