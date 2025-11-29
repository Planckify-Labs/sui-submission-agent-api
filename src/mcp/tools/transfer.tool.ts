import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Address } from 'viem';
import { SendNativeTokenInputSchema, type SendNativeTokenInput } from '../../blockchain/types/schemas';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import { transformError, createUnsupportedChainError } from '../../blockchain/errors/error-transformer';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';

export const sendNativeTokenTool: Tool = {
  name: 'send_native_token',
  description: 'Send native tokens to an address on a specific chain',
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
      amount: { 
        type: 'string', 
        description: 'Amount in wei as string' 
      },
    },
    required: ['chainId', 'to', 'amount'],
  },
};

export async function handleSendNativeToken(
  args: unknown,
  blockchainService: BlockchainService,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: SendNativeTokenInput = SendNativeTokenInputSchema.parse(args);

    if (!chainRegistry.isSupported(input.chainId)) {
      const error = createUnsupportedChainError(input.chainId);
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    const result = await blockchainService.sendNativeToken(
      input.chainId,
      input.to as Address,
      BigInt(input.amount),
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error) {
    const blockchainError = transformError(error);
    return {
      content: [{ type: 'text', text: JSON.stringify(blockchainError) }],
      isError: true,
    };
  }
}
