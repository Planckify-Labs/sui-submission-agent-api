import { composeAgentTools } from '../internal/compose';
import type { ToolMeta } from '../internal/types';

export const WALLET_ADDRESS_BOOK_TOOLS: Record<string, ToolMeta> = composeAgentTools('wallet', {
  // ─── Mobile / address_book — capability `read` ─────────────────────────────
  // Address book tools run on the mobile client because the data lives in the
  // user's authenticated session — the server has zero knowledge of contacts.
  // Auth is handled transparently by the mobile's ky instance (Bearer token
  // from secure storage). All three tools are classified `read` / silent UX.
  get_address_book: {
    name: 'get_address_book',
    category: 'utility',
    executor: 'mobile',
    capability: 'read',
    description:
      "Return all saved contacts from the user's address book. Each contact " +
      'has an id, label (display name), blockchain address, and optional ' +
      'ens_name, notes, and chain_name fields. Use this to list contacts or ' +
      'to resolve a name to an address before initiating a transfer. ' +
      'Auth required — the mobile loads the user JWT from secure storage.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  get_address_book_entry: {
    name: 'get_address_book_entry',
    category: 'utility',
    executor: 'mobile',
    capability: 'read',
    description:
      'Fetch a single address book contact by its id. Use this for a precise ' +
      "look-up when you already know the contact's id (e.g. from a previous " +
      'get_address_book or search_address_book call). Returns id, label, ' +
      'address, and optional ens_name / notes / chain_name. Auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique contact id returned by get_address_book or search_address_book.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  search_address_book: {
    name: 'search_address_book',
    category: 'utility',
    executor: 'mobile',
    capability: 'read',
    description:
      "Search the user's address book contacts by name, address, or chain. " +
      'Use this to resolve a human label like "Alice" or "my Binance wallet" ' +
      'to a blockchain address before a transfer — NEVER guess an address. ' +
      'At least one of query, chain_name, or is_evm must be provided. ' +
      'Returns a filtered contacts list with the same fields as get_address_book. ' +
      'Auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Case-insensitive substring searched across label, address, ' +
            'ens_name, and notes fields.',
        },
        chain_name: {
          type: 'string',
          description:
            'Exact (case-insensitive) match on the contact\'s chainName field ' +
            '(e.g. "Ethereum", "Base", "BNB Smart Chain").',
        },
        is_evm: {
          type: 'boolean',
          description:
            'If true, return only EVM-compatible contacts. If false, return ' +
            'only non-EVM contacts. Omit to return all.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
});
