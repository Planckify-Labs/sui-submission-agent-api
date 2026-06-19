import type { ToolMeta } from '../../../tools/internal/types';
import { WALLET_ADDRESS_BOOK_TOOLS } from './addressBook';
import { WALLET_POINTS_TOOLS } from './points';
import { WALLET_READ_TOOLS } from './reads';
import { WALLET_SOLANA_TOOLS } from './solana';
import { WALLET_SUI_TOOLS } from './sui';
import { WALLET_WRITE_TOOLS } from './writes';

export {
  WALLET_ADDRESS_BOOK_TOOLS,
  WALLET_POINTS_TOOLS,
  WALLET_READ_TOOLS,
  WALLET_SOLANA_TOOLS,
  WALLET_SUI_TOOLS,
  WALLET_WRITE_TOOLS,
};

export const WALLET_TOOLS: Record<string, ToolMeta> = {
  ...WALLET_READ_TOOLS,
  ...WALLET_WRITE_TOOLS,
  ...WALLET_POINTS_TOOLS,
  ...WALLET_ADDRESS_BOOK_TOOLS,
  ...WALLET_SOLANA_TOOLS,
  ...WALLET_SUI_TOOLS,
};
