import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Hash } from 'viem';
import { GetTransactionInputSchema, type GetTransactionInput } from '../../blockchain/types/schemas';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import { transformError, createUnsupportedChainError } from '../../blockchain/errors/error-transformer';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';

export const getTransactionTool: Tool = {
  name: 'get_transaction',
  description: 'Get transaction details and status by hash',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: { 
        type: 'number', 
        description: 'Chain ID' 
      },
      hash: { 
        type: 'string', 
        description: 'Transaction hash' 
      },
    },
    required: ['chainId', 'hash'],
  },
};

export async function handleGetTransaction(
  args: unknown,
  blockchainService: BlockchainService,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: GetTransactionInput = GetTransactionInputSchema.parse(args);

    if (!chainRegistry.isSupported(input.chainId)) {
      const error = createUnsupportedChainError(input.chainId);
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    const result = await blockchainService.getTransaction(
      input.chainId,
      input.hash as Hash,
    );

    const serializedResult = JSON.stringify(result, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );

    return {
      content: [{ type: 'text', text: serializedResult }],
    };
  } catch (error) {
    const blockchainError = transformError(error);
    return {
      content: [{ type: 'text', text: JSON.stringify(blockchainError) }],
      isError: true,
    };
  }
}
