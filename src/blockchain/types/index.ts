import type { Address, Hash, Hex } from 'viem';

export interface BalanceResult {
  wei: string;
  formatted: string;
  symbol: string;
}

export interface TransactionResult {
  hash: Hash;
  chainId: number;
}

export interface TransactionDetails {
  hash: Hash;
  status: 'pending' | 'success' | 'reverted';
  blockNumber: bigint | null;
  gasUsed: bigint | null;
  from: Address;
  to: Address | null;
  value: string;
}

export interface GasEstimate {
  gasUnits: bigint;
  gasCostWei: string;
  gasCostFormatted: string;
}

export interface ContractReadParams {
  chainId: number;
  contractAddress: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

export interface ContractWriteParams extends ContractReadParams {
  value?: bigint;
}

export interface BlockchainError {
  type: 'validation' | 'insufficient_funds' | 'contract_revert' | 'connection' | 'not_found' | 'unknown';
  message: string;
  chainId?: number;
  details?: Record<string, unknown>;
}

export interface ChainInfo {
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
}

export interface ToolErrorResponse {
  content: [{
    type: 'text';
    text: string;
  }];
  isError: true;
}
