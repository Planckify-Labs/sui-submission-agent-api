import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  TransactionNotFoundError,
  HttpRequestError,
  InvalidAddressError,
} from 'viem';
import { z } from 'zod';
import type { BlockchainError } from '../types';
import { formatValidationErrors } from '../types/schemas';

export interface ErrorTransformer {
  transform(error: unknown, chainId?: number): BlockchainError;
}

export function transformError(error: unknown, chainId?: number): BlockchainError {
  if (error instanceof z.ZodError) {
    return {
      type: 'validation',
      message: 'Input validation failed',
      chainId,
      details: { 
        errors: error.issues,
        fields: formatValidationErrors(error)
      }
    };
  }

  if (error instanceof InsufficientFundsError) {
    return {
      type: 'insufficient_funds',
      message: 'Insufficient funds for transaction',
      chainId
    };
  }

  if (error instanceof ContractFunctionRevertedError) {
    return {
      type: 'contract_revert',
      message: error.reason || 'Contract execution reverted',
      chainId,
      details: { 
        reason: error.reason,
        signature: error.signature
      }
    };
  }

  if (error instanceof TransactionNotFoundError) {
    return {
      type: 'not_found',
      message: 'Transaction not found',
      chainId
    };
  }

  if (error instanceof HttpRequestError) {
    return {
      type: 'connection',
      message: 'Failed to connect to RPC endpoint',
      chainId,
      details: { url: error.url }
    };
  }

  if (error instanceof InvalidAddressError) {
    return {
      type: 'validation',
      message: error.shortMessage || 'Invalid address format',
      chainId,
      details: { 
        fields: { address: ['Invalid Ethereum address format'] }
      }
    };
  }

  if (error instanceof BaseError) {
    return {
      type: 'unknown',
      message: error.shortMessage || error.message,
      chainId,
      details: {
        name: error.name,
        cause: error.cause instanceof Error ? error.cause.message : undefined
      }
    };
  }

  if (error instanceof Error) {
    return {
      type: 'unknown',
      message: error.message,
      chainId,
      details: { name: error.name }
    };
  }

  return {
    type: 'unknown',
    message: 'Unknown error occurred',
    chainId
  };
}

export function createErrorTransformer(): ErrorTransformer {
  return {
    transform: transformError
  };
}

export function createUnsupportedChainError(chainId: number): BlockchainError {
  return {
    type: 'validation',
    message: `Chain with ID ${chainId} is not configured or supported`,
    chainId,
    details: {
      fields: { chainId: [`Chain ${chainId} is not supported`] }
    }
  };
}

export function createMissingWalletError(): BlockchainError {
  return {
    type: 'validation',
    message: 'Wallet configuration is missing. AGENT_WALLET_PRIVATE_KEY environment variable is not set.',
    details: {
      fields: { privateKey: ['Private key is not configured'] }
    }
  };
}

export function createContractNotFoundError(contractAddress: string, chainId?: number): BlockchainError {
  return {
    type: 'not_found',
    message: `Contract does not exist at address ${contractAddress}`,
    chainId,
    details: {
      contractAddress,
      fields: { contractAddress: ['Contract does not exist at this address'] }
    }
  };
}

export function isBlockchainError(error: unknown): error is BlockchainError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  
  const obj = error as Record<string, unknown>;
  return (
    typeof obj.type === 'string' &&
    ['validation', 'insufficient_funds', 'contract_revert', 'connection', 'not_found', 'unknown'].includes(obj.type) &&
    typeof obj.message === 'string'
  );
}
