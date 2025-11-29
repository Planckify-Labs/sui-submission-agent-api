import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';
import { transformError } from '../../blockchain/errors/error-transformer';

export const getSupportedChainsTool: Tool = {
  name: 'get_supported_chains',
  description: 'Get list of all supported blockchain networks',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetSupportedChains(
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const chains = chainRegistry.getAllChains();

    const result = {
      count: chains.length,
      chains: chains.map(chain => ({
        chainId: chain.chainId,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
      })),
    };

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
