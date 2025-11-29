import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Address, Hex } from 'viem';
import { EstimateGasInputSchema, type EstimateGasInput } from '../../blockchain/types/schemas';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import type { WalletService } from '../../blockchain/services/wallet.service';
import { transformError, createUnsupportedChainError, createMissingWalletError } from '../../blockchain/errors/error-transformer';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';

export const estimateGasTool: Tool = {
  name: 'estimate_gas',
  description: 'Estimate gas cost for a transaction from the connected agent wallet',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: { 
        type: 'number', 
        description: 'Chain ID' 
      },
      to: { 
        type: 'string', 
        description: 'Recipient address' 
      },
      value: { 
        type: 'string', 
        description: 'Value in wei (optional)' 
      },
      data: { 
        type: 'string', 
        description: 'Transaction data hex (optional)' 
      },
    },
    required: ['chainId', 'to'],
  },
};

export async function handleEstimateGas(
  args: unknown,
  blockchainService: BlockchainService,
  walletService: WalletService | null,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: EstimateGasInput = EstimateGasInputSchema.parse(args);

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

    const result = await blockchainService.estimateGas(
      input.chainId,
      input.to as Address,
      input.value ? BigInt(input.value) : undefined,
      input.data as Hex | undefined,
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
