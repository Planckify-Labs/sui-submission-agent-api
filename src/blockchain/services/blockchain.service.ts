import type { Address, Hash, Hex } from 'viem';
import { formatUnits } from 'viem';
import type {
  BalanceResult,
  TransactionResult,
  TransactionDetails,
  GasEstimate,
  ContractReadParams,
  ContractWriteParams,
} from '../types';
import { transformError } from '../errors/error-transformer';
import { ViemClientFactory, getDefaultClientFactory } from '../clients/client-factory';
import { AgentWalletService, getDefaultWalletService } from './wallet.service';
import { ChainRegistry, getDefaultChainRegistry } from '../chains/chain-registry';

export interface BlockchainService {
  getBalance(chainId: number, address: Address): Promise<BalanceResult>;
  sendNativeToken(chainId: number, to: Address, amount: bigint): Promise<TransactionResult>;
  readContract(params: ContractReadParams): Promise<unknown>;
  writeContract(params: ContractWriteParams): Promise<TransactionResult>;
  getTransaction(chainId: number, hash: Hash): Promise<TransactionDetails>;
  estimateGas(chainId: number, to: Address, value?: bigint, data?: Hex): Promise<GasEstimate>;
  estimateContractGas(params: ContractWriteParams): Promise<GasEstimate>;
}

export class ViemBlockchainService implements BlockchainService {
  private clientFactory: ViemClientFactory;
  private walletService: AgentWalletService | null;
  private chainRegistry: ChainRegistry;

  constructor(
    clientFactory?: ViemClientFactory,
    walletService?: AgentWalletService | null,
    chainRegistry?: ChainRegistry
  ) {
    this.clientFactory = clientFactory ?? getDefaultClientFactory();
    this.walletService = walletService === null ? null : (walletService ?? getDefaultWalletService());
    this.chainRegistry = chainRegistry ?? getDefaultChainRegistry();
  }

  private requireWalletService(): AgentWalletService {
    if (!this.walletService) {
      throw new Error('Wallet service not configured. Set AGENT_WALLET_PRIVATE_KEY environment variable.');
    }
    return this.walletService;
  }

  async getBalance(chainId: number, address: Address): Promise<BalanceResult> {
    try {
      const publicClient = this.clientFactory.getPublicClient(chainId);
      const chainInfo = this.chainRegistry.getChain(chainId);

      const balanceWei = await publicClient.getBalance({ address });

      const decimals = chainInfo?.nativeCurrency.decimals ?? 18;
      const symbol = chainInfo?.nativeCurrency.symbol ?? 'ETH';

      return {
        wei: balanceWei.toString(),
        formatted: formatUnits(balanceWei, decimals),
        symbol,
      };
    } catch (error) {
      throw transformError(error, chainId);
    }
  }


  async sendNativeToken(
    chainId: number,
    to: Address,
    amount: bigint
  ): Promise<TransactionResult> {
    try {
      const walletService = this.requireWalletService();
      const account = walletService.getAccount();
      const walletClient = this.clientFactory.getWalletClient(chainId, account);

      const hash = await walletClient.sendTransaction({
        to,
        value: amount,
      });

      return {
        hash,
        chainId,
      };
    } catch (error) {
      throw transformError(error, chainId);
    }
  }

  async readContract(params: ContractReadParams): Promise<unknown> {
    try {
      const publicClient = this.clientFactory.getPublicClient(params.chainId);

      const result = await publicClient.readContract({
        address: params.contractAddress,
        abi: params.abi as readonly unknown[],
        functionName: params.functionName,
        args: params.args as readonly unknown[] | undefined,
      });

      return result;
    } catch (error) {
      throw transformError(error, params.chainId);
    }
  }

  async writeContract(params: ContractWriteParams): Promise<TransactionResult> {
    try {
      const walletService = this.requireWalletService();
      const account = walletService.getAccount();
      const walletClient = this.clientFactory.getWalletClient(params.chainId, account);

      const writeParams: any = {
        address: params.contractAddress,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
      };

      if (params.value !== undefined) {
        writeParams.value = params.value;
      }

      const hash = await walletClient.writeContract(writeParams);

      return {
        hash,
        chainId: params.chainId,
      };
    } catch (error) {
      throw transformError(error, params.chainId);
    }
  }


  async getTransaction(chainId: number, hash: Hash): Promise<TransactionDetails> {
    try {
      const publicClient = this.clientFactory.getPublicClient(chainId);

      const tx = await publicClient.getTransaction({ hash });

      let status: 'pending' | 'success' | 'reverted' = 'pending';
      let blockNumber: bigint | null = null;
      let gasUsed: bigint | null = null;

      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        status = receipt.status === 'success' ? 'success' : 'reverted';
        blockNumber = receipt.blockNumber;
        gasUsed = receipt.gasUsed;
      } catch {
        status = 'pending';
        blockNumber = tx.blockNumber ?? null;
      }

      return {
        hash: tx.hash,
        status,
        blockNumber,
        gasUsed,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
      };
    } catch (error) {
      throw transformError(error, chainId);
    }
  }

  async estimateGas(
    chainId: number,
    to: Address,
    value?: bigint,
    data?: Hex
  ): Promise<GasEstimate> {
    try {
      const publicClient = this.clientFactory.getPublicClient(chainId);
      const chainInfo = this.chainRegistry.getChain(chainId);
      const walletService = this.requireWalletService();
      const account = walletService.getAccount();

      const gasUnits = await publicClient.estimateGas({
        account,
        to,
        value,
        data,
      });

      const gasPrice = await publicClient.getGasPrice();

      const gasCostWei = gasUnits * gasPrice;
      const decimals = chainInfo?.nativeCurrency.decimals ?? 18;
      const symbol = chainInfo?.nativeCurrency.symbol ?? 'ETH';

      return {
        gasUnits,
        gasCostWei: gasCostWei.toString(),
        gasCostFormatted: `${formatUnits(gasCostWei, decimals)} ${symbol}`,
      };
    } catch (error) {
      throw transformError(error, chainId);
    }
  }


  async estimateContractGas(params: ContractWriteParams): Promise<GasEstimate> {
    try {
      const publicClient = this.clientFactory.getPublicClient(params.chainId);
      const chainInfo = this.chainRegistry.getChain(params.chainId);
      const walletService = this.requireWalletService();
      const account = walletService.getAccount();

      const estimateParams: any = {
        account,
        address: params.contractAddress,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
      };

      if (params.value !== undefined) {
        estimateParams.value = params.value;
      }

      const gasUnits = await publicClient.estimateContractGas(estimateParams);

      const gasPrice = await publicClient.getGasPrice();

      const gasCostWei = gasUnits * gasPrice;
      const decimals = chainInfo?.nativeCurrency.decimals ?? 18;
      const symbol = chainInfo?.nativeCurrency.symbol ?? 'ETH';

      return {
        gasUnits,
        gasCostWei: gasCostWei.toString(),
        gasCostFormatted: `${formatUnits(gasCostWei, decimals)} ${symbol}`,
      };
    } catch (error) {
      throw transformError(error, params.chainId);
    }
  }
}

let defaultBlockchainService: ViemBlockchainService | null = null;

export function getDefaultBlockchainService(): ViemBlockchainService {
  if (!defaultBlockchainService) {
    defaultBlockchainService = new ViemBlockchainService();
  }
  return defaultBlockchainService;
}

export function createBlockchainService(
  clientFactory?: ViemClientFactory,
  walletService?: AgentWalletService,
  chainRegistry?: ChainRegistry
): ViemBlockchainService {
  return new ViemBlockchainService(clientFactory, walletService, chainRegistry);
}

export function resetDefaultBlockchainService(): void {
  defaultBlockchainService = null;
}
