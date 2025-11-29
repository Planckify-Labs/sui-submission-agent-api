import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Address } from 'viem';
import { 
  ReadContractInputSchema, 
  WriteContractInputSchema,
  type ReadContractInput,
  type WriteContractInput,
} from '../../blockchain/types/schemas';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import { transformError, createUnsupportedChainError } from '../../blockchain/errors/error-transformer';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';

export const readContractTool: Tool = {
  name: 'read_contract',
  description: 'Call a read-only function on a smart contract',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: { 
        type: 'number', 
        description: 'Chain ID' 
      },
      contractAddress: { 
        type: 'string', 
        description: 'Contract address' 
      },
      abi: { 
        type: 'array', 
        description: 'Contract ABI (array of function definitions)' 
      },
      functionName: { 
        type: 'string', 
        description: 'Function name to call' 
      },
      args: { 
        type: 'array', 
        description: 'Function arguments' 
      },
    },
    required: ['chainId', 'contractAddress', 'abi', 'functionName'],
  },
};

export const writeContractTool: Tool = {
  name: 'write_contract',
  description: 'Execute a state-changing function on a smart contract',
  inputSchema: {
    type: 'object',
    properties: {
      chainId: { 
        type: 'number', 
        description: 'Chain ID' 
      },
      contractAddress: { 
        type: 'string', 
        description: 'Contract address' 
      },
      abi: { 
        type: 'array', 
        description: 'Contract ABI' 
      },
      functionName: { 
        type: 'string', 
        description: 'Function name to call' 
      },
      args: { 
        type: 'array', 
        description: 'Function arguments' 
      },
      value: { 
        type: 'string', 
        description: 'Native token value to send (in wei)' 
      },
    },
    required: ['chainId', 'contractAddress', 'abi', 'functionName'],
  },
};

export async function handleReadContract(
  args: unknown,
  blockchainService: BlockchainService,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: ReadContractInput = ReadContractInputSchema.parse(args);

    if (!chainRegistry.isSupported(input.chainId)) {
      const error = createUnsupportedChainError(input.chainId);
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    const result = await blockchainService.readContract({
      chainId: input.chainId,
      contractAddress: input.contractAddress as Address,
      abi: input.abi as readonly unknown[],
      functionName: input.functionName,
      args: input.args as readonly unknown[] | undefined,
    });

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

export async function handleWriteContract(
  args: unknown,
  blockchainService: BlockchainService,
  chainRegistry: ChainRegistry,
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const input: WriteContractInput = WriteContractInputSchema.parse(args);

    if (!chainRegistry.isSupported(input.chainId)) {
      const error = createUnsupportedChainError(input.chainId);
      return {
        content: [{ type: 'text', text: JSON.stringify(error) }],
        isError: true,
      };
    }

    const result = await blockchainService.writeContract({
      chainId: input.chainId,
      contractAddress: input.contractAddress as Address,
      abi: input.abi as readonly unknown[],
      functionName: input.functionName,
      args: input.args as readonly unknown[] | undefined,
      value: input.value ? BigInt(input.value) : undefined,
    });

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
