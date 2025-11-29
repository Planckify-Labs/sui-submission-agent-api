import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import type { BlockchainError } from '../types';

export interface WalletService {
  getAccount(): PrivateKeyAccount;
  getAddress(): Address;
}

export class WalletConfigurationError extends Error {
  public readonly blockchainError: BlockchainError;

  constructor(message: string) {
    super(message);
    this.name = 'WalletConfigurationError';
    this.blockchainError = {
      type: 'validation',
      message,
      details: { field: 'AGENT_WALLET_PRIVATE_KEY' },
    };
  }
}

function isValidPrivateKey(key: string): key is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(key);
}

export class AgentWalletService implements WalletService {
  private account: PrivateKeyAccount | null = null;
  private privateKey: Hex | null = null;

  constructor(privateKey?: string) {
    const key = privateKey ?? process.env.AGENT_WALLET_PRIVATE_KEY;

    if (!key) {
      throw new WalletConfigurationError(
        'Wallet configuration is missing: AGENT_WALLET_PRIVATE_KEY environment variable is not set'
      );
    }

    if (!isValidPrivateKey(key)) {
      throw new WalletConfigurationError(
        'Wallet configuration is invalid: AGENT_WALLET_PRIVATE_KEY must be a valid hex string (0x followed by 64 hex characters)'
      );
    }

    this.privateKey = key;
  }

  getAccount(): PrivateKeyAccount {
    if (!this.privateKey) {
      throw new WalletConfigurationError(
        'Wallet configuration is missing: AGENT_WALLET_PRIVATE_KEY environment variable is not set'
      );
    }

    if (!this.account) {
      this.account = privateKeyToAccount(this.privateKey);
    }

    return this.account;
  }

  getAddress(): Address {
    return this.getAccount().address;
  }
}

let defaultWalletService: AgentWalletService | null = null;

export function getDefaultWalletService(): AgentWalletService {
  if (!defaultWalletService) {
    defaultWalletService = new AgentWalletService();
  }
  return defaultWalletService;
}

export function createWalletService(privateKey?: string): AgentWalletService {
  return new AgentWalletService(privateKey);
}

export function resetDefaultWalletService(): void {
  defaultWalletService = null;
}
