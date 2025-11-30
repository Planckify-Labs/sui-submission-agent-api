import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TakumiPayService, CustomerInfo } from '../../takumipay';
import type { ToolResponse } from './index';

export const getProductsTool: Tool = {
  name: 'takumipay_get_products',
  description: 'Get all available products from TakumiPay. Returns a list of products with their categories, variants, and pricing information.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor for fetching next page',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const searchProductsTool: Tool = {
  name: 'takumipay_search_products',
  description: 'Search for products by name, code, or other criteria. Use this to find specific products or filter by category.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'General search query (searches name and code)',
      },
      name: {
        type: 'string',
        description: 'Filter by product name (partial match)',
      },
      code: {
        type: 'string',
        description: 'Filter by product code (partial match)',
      },
      isVoucher: {
        type: 'boolean',
        description: 'Filter by voucher type (true for vouchers, false for non-vouchers)',
      },
      active: {
        type: 'boolean',
        description: 'Filter by active status',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const getProductByIdTool: Tool = {
  name: 'takumipay_get_product_by_id',
  description: 'Get detailed information about a specific product by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The product ID',
      },
    },
    required: ['id'],
  },
};

export const getProductByCodeTool: Tool = {
  name: 'takumipay_get_product_by_code',
  description: 'Get detailed information about a specific product by its code.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The product code',
      },
    },
    required: ['code'],
  },
};

export const getVouchersTool: Tool = {
  name: 'takumipay_get_vouchers',
  description: 'Get all voucher products. Vouchers are digital products like gift cards, game credits, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const getNonVouchersTool: Tool = {
  name: 'takumipay_get_non_vouchers',
  description: 'Get all non-voucher products. These are products that are not digital vouchers.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const getProductsGroupedByCategoriesTool: Tool = {
  name: 'takumipay_get_products_grouped_by_categories',
  description: 'Get products organized by their categories. Useful for browsing or displaying a catalog.',
  inputSchema: {
    type: 'object',
    properties: {
      take: {
        type: 'number',
        description: 'Number of products per category (default: 6)',
      },
    },
    required: [],
  },
};

export const getProductsByCategoryTool: Tool = {
  name: 'takumipay_get_products_by_category',
  description: 'Get all products in a specific category.',
  inputSchema: {
    type: 'object',
    properties: {
      categoryId: {
        type: 'string',
        description: 'The category ID',
      },
    },
    required: ['categoryId'],
  },
};

export const getCategoriesTool: Tool = {
  name: 'takumipay_get_categories',
  description: 'Get all product categories.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const getCategoryByIdTool: Tool = {
  name: 'takumipay_get_category_by_id',
  description: 'Get detailed information about a specific category including its products.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The category ID',
      },
    },
    required: ['id'],
  },
};

export const getProductVariantsTool: Tool = {
  name: 'takumipay_get_product_variants',
  description: 'Get all variants for a specific product. Variants represent different options/SKUs of a product.',
  inputSchema: {
    type: 'object',
    properties: {
      productId: {
        type: 'string',
        description: 'The product ID',
      },
    },
    required: ['productId'],
  },
};

export const getVariantByIdTool: Tool = {
  name: 'takumipay_get_variant_by_id',
  description: 'Get detailed information about a specific product variant.',
  inputSchema: {
    type: 'object',
    properties: {
      variantId: {
        type: 'string',
        description: 'The variant ID',
      },
    },
    required: ['variantId'],
  },
};

export const searchVariantsTool: Tool = {
  name: 'takumipay_search_variants',
  description: 'Search for product variants by name, code, or other criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'General search query (searches name and variant code)',
      },
      name: {
        type: 'string',
        description: 'Filter by variant name (partial match)',
      },
      variantCode: {
        type: 'string',
        description: 'Filter by variant code (partial match)',
      },
      productId: {
        type: 'string',
        description: 'Filter by parent product ID',
      },
      isActive: {
        type: 'boolean',
        description: 'Filter by active status',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const getProductInputFieldsTool: Tool = {
  name: 'takumipay_get_product_input_fields',
  description: 'Get the required input fields for purchasing a product. These fields need to be filled by the customer.',
  inputSchema: {
    type: 'object',
    properties: {
      productId: {
        type: 'string',
        description: 'The product ID',
      },
    },
    required: ['productId'],
  },
};

export const getProductPricesTool: Tool = {
  name: 'takumipay_get_product_prices',
  description: 'Get all pricing information for a specific product.',
  inputSchema: {
    type: 'object',
    properties: {
      productId: {
        type: 'string',
        description: 'The product ID',
      },
    },
    required: ['productId'],
  },
};

export const createBookingTool: Tool = {
  name: 'takumipay_create_booking',
  description: 'Create a booking to reserve a product for purchase. This locks the exchange rate and reserves the product. The booking expires after a set time if not executed.',
  inputSchema: {
    type: 'object',
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Wallet address of the user making the booking',
      },
      productVariantId: {
        type: 'string',
        description: 'ID of the product variant to book',
      },
      productPriceId: {
        type: 'string',
        description: 'ID of the product price to use',
      },
      payment: {
        type: 'object',
        description: 'Payment details',
        properties: {
          tokenAddress: {
            type: 'string',
            description: 'Token contract address for payment',
          },
          blockchainId: {
            type: 'string',
            description: 'ID of the blockchain for payment',
          },
          exchangeRateId: {
            type: 'number',
            description: 'ID of the exchange rate to lock',
          },
        },
        required: ['tokenAddress', 'blockchainId', 'exchangeRateId'],
      },
      customerInfo: {
        type: 'object',
        description: 'Customer information required for the product (e.g., phone number, game ID)',
      },
    },
    required: ['walletAddress', 'productVariantId', 'productPriceId', 'payment'],
  },
};

export const getWalletBookingsTool: Tool = {
  name: 'takumipay_get_wallet_bookings',
  description: 'Get all bookings for a specific wallet address.',
  inputSchema: {
    type: 'object',
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Wallet address to get bookings for',
      },
      status: {
        type: 'string',
        enum: ['PENDING', 'EXPIRED', 'EXECUTED', 'CANCELLED'],
        description: 'Filter by booking status',
      },
      productId: {
        type: 'string',
        description: 'Filter by product ID',
      },
    },
    required: ['walletAddress'],
  },
};

export const getLatestBookingTool: Tool = {
  name: 'takumipay_get_latest_booking',
  description: 'Get the most recent booking for a wallet address.',
  inputSchema: {
    type: 'object',
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Wallet address to get the latest booking for',
      },
    },
    required: ['walletAddress'],
  },
};

export const executeBookingTool: Tool = {
  name: 'takumipay_execute_booking',
  description: 'Mark a booking as executed after successful blockchain payment.',
  inputSchema: {
    type: 'object',
    properties: {
      bookingId: {
        type: 'string',
        description: 'ID of the booking to execute',
      },
    },
    required: ['bookingId'],
  },
};

export const cancelBookingTool: Tool = {
  name: 'takumipay_cancel_booking',
  description: 'Cancel a pending booking.',
  inputSchema: {
    type: 'object',
    properties: {
      bookingId: {
        type: 'string',
        description: 'ID of the booking to cancel',
      },
    },
    required: ['bookingId'],
  },
};

// ==================== Purchase Tools ====================

export const createPurchaseTool: Tool = {
  name: 'takumipay_create_purchase',
  description: 'Create a purchase after blockchain payment verification. This triggers the vendor fulfillment process.',
  inputSchema: {
    type: 'object',
    properties: {
      refId: {
        type: 'string',
        description: 'Unique reference ID to prevent duplicate processing (can be transaction hash)',
      },
      walletAddress: {
        type: 'string',
        description: 'Wallet address of the purchaser',
      },
      bookingId: {
        type: 'string',
        description: 'ID of the booking to convert to purchase',
      },
      contractAddress: {
        type: 'string',
        description: 'Smart contract address that processed the payment',
      },
      networkId: {
        type: 'string',
        description: 'Network/blockchain ID from the database',
      },
      transactionHash: {
        type: 'string',
        description: 'Blockchain transaction hash to verify',
      },
    },
    required: ['refId', 'walletAddress', 'bookingId', 'contractAddress', 'networkId', 'transactionHash'],
  },
};

export const getPurchasesTool: Tool = {
  name: 'takumipay_get_purchases',
  description: 'Get all purchases with pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return (default: 10)',
      },
    },
    required: [],
  },
};

export const searchPurchasesTool: Tool = {
  name: 'takumipay_search_purchases',
  description: 'Search for purchases by various criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Filter by user ID',
      },
      transactionId: {
        type: 'string',
        description: 'Filter by transaction ID',
      },
      productId: {
        type: 'string',
        description: 'Filter by product ID',
      },
      tokenId: {
        type: 'string',
        description: 'Filter by token ID',
      },
      blockchainId: {
        type: 'string',
        description: 'Filter by blockchain ID',
      },
      status: {
        type: 'string',
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
        description: 'Filter by purchase status',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor',
      },
      take: {
        type: 'number',
        description: 'Number of items to return',
      },
    },
    required: [],
  },
};

export const getPurchaseByIdTool: Tool = {
  name: 'takumipay_get_purchase_by_id',
  description: 'Get detailed information about a specific purchase.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The purchase ID',
      },
    },
    required: ['id'],
  },
};

export const getPurchaseStatusByRefIdTool: Tool = {
  name: 'takumipay_get_purchase_status_by_ref_id',
  description: 'Get the status of a purchase by its reference ID. Useful for tracking purchase progress.',
  inputSchema: {
    type: 'object',
    properties: {
      refId: {
        type: 'string',
        description: 'The reference ID used when creating the purchase',
      },
    },
    required: ['refId'],
  },
};

export const takumiPayProductTools: Tool[] = [
  getProductsTool,
  searchProductsTool,
  getProductByIdTool,
  getProductByCodeTool,
  getVouchersTool,
  getNonVouchersTool,
  getProductsGroupedByCategoriesTool,
  getProductsByCategoryTool,
  getCategoriesTool,
  getCategoryByIdTool,
  getProductVariantsTool,
  getVariantByIdTool,
  searchVariantsTool,
  getProductInputFieldsTool,
  getProductPricesTool,
  // Booking tools
  createBookingTool,
  getWalletBookingsTool,
  getLatestBookingTool,
  executeBookingTool,
  cancelBookingTool,
  // Purchase tools
  createPurchaseTool,
  getPurchasesTool,
  searchPurchasesTool,
  getPurchaseByIdTool,
  getPurchaseStatusByRefIdTool,
];

// ==================== Handler Functions ====================

function createSuccessResponse(data: unknown): ToolResponse {
  // Strip vendor information before exposing to AI context
  const sanitizedData = stripVendorInfo(data);
  return {
    content: [{ type: 'text', text: JSON.stringify(sanitizedData, null, 2) }],
  };
}

function createErrorResponse(error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// Strip vendor-related information from data before exposing to AI context
function stripVendorInfo<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => stripVendorInfo(item)) as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Skip vendor-related fields - never expose to AI context
      if (
        key === 'vendor' ||
        key === 'vendorId' ||
        key === 'vendorName' ||
        key === 'vendorResponse' ||
        key === 'vendorRefId' ||
        key === 'priceFromVendor'
      ) {
        continue;
      }
      result[key] = stripVendorInfo(value);
    }
    return result as T;
  }

  return data;
}

export async function handleGetProducts(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { cursor, take } = (args as { cursor?: string; take?: number }) ?? {};
    const products = await takumiPayService.getProducts({ cursor, take });
    return createSuccessResponse({ count: products.length, products });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleSearchProducts(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { query, name, code, isVoucher, active, cursor, take } = (args as {
      query?: string;
      name?: string;
      code?: string;
      isVoucher?: boolean;
      active?: boolean;
      cursor?: string;
      take?: number;
    }) ?? {};
    // Never pass vendor-related params even if somehow provided
    const products = await takumiPayService.searchProducts({
      query,
      name,
      code,
      isVoucher,
      active,
      cursor,
      take,
    });
    return createSuccessResponse({ count: products.length, products });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductById(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { id } = args as { id: string };
    if (!id) {
      return createErrorResponse(new Error('Product ID is required'));
    }
    const product = await takumiPayService.getProductById(id);
    return createSuccessResponse(product);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductByCode(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { code } = args as { code: string };
    if (!code) {
      return createErrorResponse(new Error('Product code is required'));
    }
    const product = await takumiPayService.getProductByCode(code);
    return createSuccessResponse(product);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetVouchers(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { cursor, take } = (args as { cursor?: string; take?: number }) ?? {};
    const vouchers = await takumiPayService.getVouchers({ cursor, take });
    return createSuccessResponse({ count: vouchers.length, vouchers });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetNonVouchers(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { cursor, take } = (args as { cursor?: string; take?: number }) ?? {};
    const products = await takumiPayService.getNonVouchers({ cursor, take });
    return createSuccessResponse({ count: products.length, products });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductsGroupedByCategories(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { take } = (args as { take?: number }) ?? {};
    const grouped = await takumiPayService.getProductsGroupedByCategories(take);
    return createSuccessResponse({ categoryCount: grouped.length, categories: grouped });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductsByCategory(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { categoryId } = args as { categoryId: string };
    if (!categoryId) {
      return createErrorResponse(new Error('Category ID is required'));
    }
    const products = await takumiPayService.getProductsByCategory(categoryId);
    return createSuccessResponse({ count: products.length, products });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetCategories(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { cursor, take } = (args as { cursor?: string; take?: number }) ?? {};
    const categories = await takumiPayService.getCategories({ cursor, take });
    return createSuccessResponse({ count: categories.length, categories });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetCategoryById(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { id } = args as { id: string };
    if (!id) {
      return createErrorResponse(new Error('Category ID is required'));
    }
    const category = await takumiPayService.getCategoryById(id);
    return createSuccessResponse(category);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductVariants(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { productId } = args as { productId: string };
    if (!productId) {
      return createErrorResponse(new Error('Product ID is required'));
    }
    const variants = await takumiPayService.getProductVariants(productId);
    return createSuccessResponse({ count: variants.length, variants });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetVariantById(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { variantId } = args as { variantId: string };
    if (!variantId) {
      return createErrorResponse(new Error('Variant ID is required'));
    }
    const variant = await takumiPayService.getVariantById(variantId);
    return createSuccessResponse(variant);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleSearchVariants(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const params = args as {
      query?: string;
      name?: string;
      variantCode?: string;
      productId?: string;
      isActive?: boolean;
      cursor?: string;
      take?: number;
    };
    const variants = await takumiPayService.searchVariants(params);
    return createSuccessResponse({ count: variants.length, variants });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductInputFields(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { productId } = args as { productId: string };
    if (!productId) {
      return createErrorResponse(new Error('Product ID is required'));
    }
    const inputFields = await takumiPayService.getProductInputFields(productId);
    return createSuccessResponse(inputFields);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetProductPrices(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { productId } = args as { productId: string };
    if (!productId) {
      return createErrorResponse(new Error('Product ID is required'));
    }
    const prices = await takumiPayService.getProductPrices(productId);
    return createSuccessResponse({ count: prices.length, prices });
  } catch (error) {
    return createErrorResponse(error);
  }
}

// ==================== Booking Handlers ====================

export async function handleCreateBooking(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const params = args as {
      walletAddress: string;
      productVariantId: string;
      productPriceId: string;
      payment: {
        tokenAddress: string;
        blockchainId: string;
        exchangeRateId: number;
      };
      customerInfo?: CustomerInfo;
    };
    
    if (!params.walletAddress || !params.productVariantId || !params.productPriceId || !params.payment) {
      return createErrorResponse(new Error('walletAddress, productVariantId, productPriceId, and payment are required'));
    }
    
    const booking = await takumiPayService.createBooking(params);
    return createSuccessResponse(booking);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetWalletBookings(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { walletAddress, status, productId } = args as {
      walletAddress: string;
      status?: 'PENDING' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED';
      productId?: string;
    };
    
    if (!walletAddress) {
      return createErrorResponse(new Error('Wallet address is required'));
    }
    
    const bookings = await takumiPayService.getWalletBookings(walletAddress, { status, productId });
    return createSuccessResponse({ count: bookings.length, bookings });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetLatestBooking(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { walletAddress } = args as { walletAddress: string };
    
    if (!walletAddress) {
      return createErrorResponse(new Error('Wallet address is required'));
    }
    
    const booking = await takumiPayService.getLatestBooking(walletAddress);
    return createSuccessResponse(booking);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleCreatePurchase(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const params = args as {
      refId: string;
      walletAddress: string;
      bookingId: string;
      contractAddress: string;
      networkId: string;
      transactionHash: string;
    };
    
    if (!params.refId || !params.walletAddress || !params.bookingId || 
        !params.contractAddress || !params.networkId || !params.transactionHash) {
      return createErrorResponse(new Error('refId, walletAddress, bookingId, contractAddress, networkId, and transactionHash are required'));
    }
    
    const purchase = await takumiPayService.createPurchase(params);
    return createSuccessResponse(purchase);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetPurchases(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { cursor, take } = (args as { cursor?: string; take?: number }) ?? {};
    const purchases = await takumiPayService.getPurchases({ cursor, take });
    return createSuccessResponse({ count: purchases.length, purchases });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleSearchPurchases(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { userId, transactionId, productId, tokenId, blockchainId, status, cursor, take } = (args as {
      userId?: string;
      transactionId?: string;
      productId?: string;
      tokenId?: string;
      blockchainId?: string;
      status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
      cursor?: string;
      take?: number;
    }) ?? {};
    // Never pass vendorId even if somehow provided
    const purchases = await takumiPayService.searchPurchases({
      userId,
      transactionId,
      productId,
      tokenId,
      blockchainId,
      status,
      cursor,
      take,
    });
    return createSuccessResponse({ count: purchases.length, purchases });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetPurchaseById(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { id } = args as { id: string };
    
    if (!id) {
      return createErrorResponse(new Error('Purchase ID is required'));
    }
    
    // Never include vendor response in AI context
    const purchase = await takumiPayService.getPurchaseById(id, false);
    return createSuccessResponse(purchase);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleGetPurchaseStatusByRefId(
  args: unknown,
  takumiPayService: TakumiPayService,
): Promise<ToolResponse> {
  try {
    const { refId } = args as { refId: string };
    
    if (!refId) {
      return createErrorResponse(new Error('Reference ID is required'));
    }
    
    const status = await takumiPayService.getPurchaseStatusByRefId(refId);
    return createSuccessResponse(status);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export function createTakumiPayToolHandlers(
  takumiPayService: TakumiPayService,
): Map<string, (args: unknown) => Promise<ToolResponse>> {
  const handlers = new Map<string, (args: unknown) => Promise<ToolResponse>>();

  handlers.set('takumipay_get_products', (args) =>
    handleGetProducts(args, takumiPayService),
  );

  handlers.set('takumipay_search_products', (args) =>
    handleSearchProducts(args, takumiPayService),
  );

  handlers.set('takumipay_get_product_by_id', (args) =>
    handleGetProductById(args, takumiPayService),
  );

  handlers.set('takumipay_get_product_by_code', (args) =>
    handleGetProductByCode(args, takumiPayService),
  );

  handlers.set('takumipay_get_vouchers', (args) =>
    handleGetVouchers(args, takumiPayService),
  );

  handlers.set('takumipay_get_non_vouchers', (args) =>
    handleGetNonVouchers(args, takumiPayService),
  );

  handlers.set('takumipay_get_products_grouped_by_categories', (args) =>
    handleGetProductsGroupedByCategories(args, takumiPayService),
  );

  handlers.set('takumipay_get_products_by_category', (args) =>
    handleGetProductsByCategory(args, takumiPayService),
  );

  handlers.set('takumipay_get_categories', (args) =>
    handleGetCategories(args, takumiPayService),
  );

  handlers.set('takumipay_get_category_by_id', (args) =>
    handleGetCategoryById(args, takumiPayService),
  );

  handlers.set('takumipay_get_product_variants', (args) =>
    handleGetProductVariants(args, takumiPayService),
  );

  handlers.set('takumipay_get_variant_by_id', (args) =>
    handleGetVariantById(args, takumiPayService),
  );

  handlers.set('takumipay_search_variants', (args) =>
    handleSearchVariants(args, takumiPayService),
  );

  handlers.set('takumipay_get_product_input_fields', (args) =>
    handleGetProductInputFields(args, takumiPayService),
  );

  handlers.set('takumipay_get_product_prices', (args) =>
    handleGetProductPrices(args, takumiPayService),
  );

  handlers.set('takumipay_create_booking', (args) =>
    handleCreateBooking(args, takumiPayService),
  );

  handlers.set('takumipay_get_wallet_bookings', (args) =>
    handleGetWalletBookings(args, takumiPayService),
  );

  handlers.set('takumipay_get_latest_booking', (args) =>
    handleGetLatestBooking(args, takumiPayService),
  );

  handlers.set('takumipay_create_purchase', (args) =>
    handleCreatePurchase(args, takumiPayService),
  );

  handlers.set('takumipay_get_purchases', (args) =>
    handleGetPurchases(args, takumiPayService),
  );

  handlers.set('takumipay_search_purchases', (args) =>
    handleSearchPurchases(args, takumiPayService),
  );

  handlers.set('takumipay_get_purchase_by_id', (args) =>
    handleGetPurchaseById(args, takumiPayService),
  );

  handlers.set('takumipay_get_purchase_status_by_ref_id', (args) =>
    handleGetPurchaseStatusByRefId(args, takumiPayService),
  );

  return handlers;
}

