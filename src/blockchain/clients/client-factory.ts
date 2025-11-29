import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
  type HttpTransport,
} from 'viem';
import { ChainRegistry, getDefaultChainRegistry } from '../chains/chain-registry';
import { createUnsupportedChainError } from '../errors/error-transformer';
import type { BlockchainError } from '../types';

export interface ClientFactory {
  getPublicClient(chainId: number): PublicClient<HttpTransport, Chain>;
  getWalletClient(chainId: number, account: Account): WalletClient<HttpTransport, Chain, Account>;
  clearCache(): void;
}

export class UnsupportedChainError extends Error {
  public readonly blockchainError: BlockchainError;
  public readonly chainId: number;

  constructor(chainId: number) {
    super(`Chain with ID ${chainId} is not configured or supported`);
    this.name = 'UnsupportedChainError';
    this.chainId = chainId;
    this.blockchainError = createUnsupportedChainError(chainId);
  }
}

export class ViemClientFactory implements ClientFactory {
  private publicClients: Map<number, PublicClient<HttpTransport, Chain>> = new Map();
  private walletClients: Map<string, WalletClient<HttpTransport, Chain, Account>> = new Map();
  private chainRegistry: ChainRegistry;

  constructor(chainRegistry?: ChainRegistry) {
    this.chainRegistry = chainRegistry ?? getDefaultChainRegistry();
  }

  getPublicClient(chainId: number): PublicClient<HttpTransport, Chain> {
    const cached = this.publicClients.get(chainId);
    if (cached) {
      return cached;
    }

    const chain = this.chainRegistry.getViemChain(chainId);
    if (!chain) {
      throw new UnsupportedChainError(chainId);
    }

    const client = createPublicClient({
      chain,
      transport: http(),
    });

    this.publicClients.set(chainId, client);
    return client;
  }

  getWalletClient(chainId: number, account: Account): WalletClient<HttpTransport, Chain, Account> {
    const cacheKey = `${chainId}:${account.address}`;

    const cached = this.walletClients.get(cacheKey);
    if (cached) {
      return cached;
    }

    const chain = this.chainRegistry.getViemChain(chainId);
    if (!chain) {
      throw new UnsupportedChainError(chainId);
    }

    const client = createWalletClient({
      chain,
      transport: http(),
      account,
    });

    this.walletClients.set(cacheKey, client);
    return client;
  }

  clearCache(): void {
    this.publicClients.clear();
    this.walletClients.clear();
  }

  getPublicClientCacheSize(): number {
    return this.publicClients.size;
  }

  getWalletClientCacheSize(): number {
    return this.walletClients.size;
  }
}

let defaultFactory: ViemClientFactory | null = null;

export function getDefaultClientFactory(): ViemClientFactory {
  if (!defaultFactory) {
    defaultFactory = new ViemClientFactory();
  }
  return defaultFactory;
}

export function createClientFactory(chainRegistry?: ChainRegistry): ViemClientFactory {
  return new ViemClientFactory(chainRegistry);
}
