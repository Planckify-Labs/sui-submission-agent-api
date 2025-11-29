import type { Chain } from 'viem';
import * as viemChains from 'viem/chains';
import type { ChainInfo } from '../types';

type ViemChainsModule = typeof viemChains;
interface ChainEntry {
  chain: Chain;
  info: ChainInfo;
}

export class ChainRegistry {
  private chainsByChainId: Map<number, ChainEntry> = new Map();
  private chainsByName: Map<string, ChainEntry> = new Map();

  constructor() {
    this.loadViemChains();
  }

  private loadViemChains(): void {
    const chainsModule = viemChains as ViemChainsModule;
    
    for (const key of Object.keys(chainsModule)) {
      const chain = chainsModule[key as keyof ViemChainsModule];
      
      if (!this.isValidChain(chain)) {
        continue;
      }

      this.registerChain(chain);
    }
  }

  private isValidChain(obj: unknown): obj is Chain {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'id' in obj &&
      'name' in obj &&
      'nativeCurrency' in obj &&
      typeof (obj as Chain).id === 'number' &&
      typeof (obj as Chain).name === 'string'
    );
  }

  private registerChain(chain: Chain): void {
    const info = this.chainToInfo(chain);
    const entry: ChainEntry = { chain, info };

    this.chainsByChainId.set(chain.id, entry);
    this.chainsByName.set(chain.name.toLowerCase(), entry);
  }

  private chainToInfo(chain: Chain): ChainInfo {
    const rpcUrls: string[] = [];
    
    if (chain.rpcUrls?.default?.http) {
      rpcUrls.push(...chain.rpcUrls.default.http);
    }

    return {
      chainId: chain.id,
      name: chain.name,
      nativeCurrency: {
        name: chain.nativeCurrency.name,
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
      },
      rpcUrls,
    };
  }

  getChain(chainId: number): ChainInfo | undefined {
    return this.chainsByChainId.get(chainId)?.info;
  }
  getViemChain(chainId: number): Chain | undefined {
    return this.chainsByChainId.get(chainId)?.chain;
  }

  getChainByName(name: string): ChainInfo | undefined {
    return this.chainsByName.get(name.toLowerCase())?.info;
  }

  getAllChains(): ChainInfo[] {
    return Array.from(this.chainsByChainId.values()).map(entry => entry.info);
  }

  getSupportedChainNames(): string[] {
    return Array.from(this.chainsByChainId.values()).map(entry => entry.info.name);
  }

  isSupported(chainId: number): boolean {
    return this.chainsByChainId.has(chainId);
  }

  addCustomChain(chain: Chain): void {
    if (!this.isValidChain(chain)) {
      throw new Error('Invalid chain configuration');
    }
    this.registerChain(chain);
  }

  getChainCount(): number {
    return this.chainsByChainId.size;
  }
}

let defaultRegistry: ChainRegistry | null = null;

export function getDefaultChainRegistry(): ChainRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ChainRegistry();
  }
  return defaultRegistry;
}

export function createChainRegistry(): ChainRegistry {
  return new ChainRegistry();
}
