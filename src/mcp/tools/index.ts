import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { BlockchainService } from '../../blockchain/services/blockchain.service';
import type { WalletService } from '../../blockchain/services/wallet.service';
import type { ChainRegistry } from '../../blockchain/chains/chain-registry';
import type { TakumiPayService } from '../../takumipay';

import { getBalanceTool, handleGetBalance } from './balance.tool';
import { sendNativeTokenTool, handleSendNativeToken } from './transfer.tool';
import { readContractTool, writeContractTool, handleReadContract, handleWriteContract } from './contract.tool';
import { getTransactionTool, handleGetTransaction } from './transaction.tool';
import { getWalletAddressTool, getWalletBalanceTool, handleGetWalletAddress, handleGetWalletBalance } from './wallet.tool';
import { getSupportedChainsTool, handleGetSupportedChains } from './chains.tool';
import { estimateGasTool, handleEstimateGas } from './gas.tool';
import { takumiPayProductTools, createTakumiPayToolHandlers } from './products.tool';
import { exchangeRateTools, createExchangeRateToolHandlers } from './exchange-rate.tool';
import { tokenContractTools, createTokenContractToolHandlers } from './token-contract.tool';

export const blockchainReadOnlyTools: Tool[] = [
  getBalanceTool,
  readContractTool,
  getTransactionTool,
  getSupportedChainsTool,
];

export const blockchainWalletTools: Tool[] = [
  sendNativeTokenTool,
  writeContractTool,
  getWalletAddressTool,
  getWalletBalanceTool,
  estimateGasTool,
];

export const blockchainTools: Tool[] = [
  ...blockchainReadOnlyTools,
  ...blockchainWalletTools,
];

export { takumiPayProductTools, createTakumiPayToolHandlers };
export { exchangeRateTools, createExchangeRateToolHandlers };
export { tokenContractTools, createTokenContractToolHandlers };

export type ToolResponse = {
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
};

export type ToolHandler = (
  args: unknown,
  services: {
    blockchainService: BlockchainService;
    walletService: WalletService | null;
    chainRegistry: ChainRegistry;
    takumiPayService?: TakumiPayService | null;
  },
) => Promise<ToolResponse>;


export function createToolHandlers(services: {
  blockchainService: BlockchainService;
  walletService: WalletService | null;
  chainRegistry: ChainRegistry;
  takumiPayService?: TakumiPayService | null;
}): Map<string, (args: unknown) => Promise<ToolResponse>> {
  const { blockchainService, walletService, chainRegistry, takumiPayService } = services;

  const handlers = new Map<string, (args: unknown) => Promise<ToolResponse>>();

  handlers.set('get_balance', (args) => 
    handleGetBalance(args, blockchainService, walletService, chainRegistry)
  );

  handlers.set('send_native_token', (args) => 
    handleSendNativeToken(args, blockchainService, chainRegistry)
  );

  handlers.set('read_contract', (args) => 
    handleReadContract(args, blockchainService, chainRegistry)
  );

  handlers.set('write_contract', (args) => 
    handleWriteContract(args, blockchainService, chainRegistry)
  );

  handlers.set('get_transaction', (args) => 
    handleGetTransaction(args, blockchainService, chainRegistry)
  );

  handlers.set('get_wallet_address', () => 
    handleGetWalletAddress(walletService)
  );

  handlers.set('get_wallet_balance', (args) => 
    handleGetWalletBalance(args, blockchainService, walletService, chainRegistry)
  );

  handlers.set('get_supported_chains', () => 
    handleGetSupportedChains(chainRegistry)
  );

  handlers.set('estimate_gas', (args) => 
    handleEstimateGas(args, blockchainService, walletService, chainRegistry)
  );

  if (takumiPayService) {
    const takumiPayHandlers = createTakumiPayToolHandlers(takumiPayService);
    for (const [name, handler] of takumiPayHandlers) {
      handlers.set(name, handler);
    }

    const exchangeRateHandlers = createExchangeRateToolHandlers(takumiPayService);
    for (const [name, handler] of exchangeRateHandlers) {
      handlers.set(name, handler);
    }

    const tokenContractHandlers = createTokenContractToolHandlers(takumiPayService);
    for (const [name, handler] of tokenContractHandlers) {
      handlers.set(name, handler);
    }
  }

  return handlers;
}

export {
  getBalanceTool,
  handleGetBalance,
  sendNativeTokenTool,
  handleSendNativeToken,
  readContractTool,
  writeContractTool,
  handleReadContract,
  handleWriteContract,
  getTransactionTool,
  handleGetTransaction,
  getWalletAddressTool,
  getWalletBalanceTool,
  handleGetWalletAddress,
  handleGetWalletBalance,
  getSupportedChainsTool,
  handleGetSupportedChains,
  estimateGasTool,
  handleEstimateGas,
};

// Response transformer utilities for customizing tool responses
export {
  transformResponse,
  createTransformedResponse,
  setToolConfig,
  getToolConfig,
  addGlobalExclusions,
  getResponseStats,
  type ResponseProfile,
  type FieldConfig,
  type ToolResponseConfig,
} from './response-transformer';
