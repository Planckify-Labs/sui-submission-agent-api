/**
 * Response Transformer for MCP Tools
 * 
 * Provides configurable response filtering to reduce token usage when
 * returning data to the agent context.
 */

export type ResponseProfile = 'minimal' | 'standard' | 'full';

export interface FieldConfig {
  /** Fields to always exclude (blacklist) */
  exclude?: string[];
  /** Fields to include (whitelist) - if set, only these fields are returned */
  include?: string[];
  /** Nested field configurations */
  nested?: Record<string, FieldConfig>;
  /** Transform function for the field value */
  transform?: (value: unknown) => unknown;
}

export interface ToolResponseConfig {
  /** Response profile to use */
  profile?: ResponseProfile;
  /** Custom field configuration (overrides profile) */
  fields?: FieldConfig;
}

// Global fields to always exclude from all responses
const GLOBAL_EXCLUDED_FIELDS = [
  'vendor',
  'vendorId',
  'vendorName',
  'vendorResponse',
  'vendorRefId',
  'priceFromVendor',
];

// Profile-based field configurations
const PROFILE_CONFIGS: Record<ResponseProfile, FieldConfig> = {
  minimal: {
    exclude: [
      ...GLOBAL_EXCLUDED_FIELDS,
      'createdAt',
      'updatedAt',
      'cursor',
      'imageUrl',
      'description',
    ],
  },
  standard: {
    exclude: [...GLOBAL_EXCLUDED_FIELDS],
  },
  full: {
    exclude: [...GLOBAL_EXCLUDED_FIELDS],
  },
};

// Tool-specific default configurations
const TOOL_CONFIGS: Record<string, ToolResponseConfig> = {
  // Booking responses - minimal by default to save tokens
  takumipay_create_booking: {
    fields: {
      include: [
        'id',
        'walletAddress',
        'status',
        'expiresAt',
        'product',
        'payment',
      ],
      nested: {
        product: {
          include: ['id', 'name', 'variant', 'price'],
          nested: {
            variant: {
              include: ['id', 'name', 'variantCode'],
            },
            price: {
              include: ['amount', 'currency'],
            },
          },
        },
        payment: {
          include: ['token', 'exchangeRate'],
          nested: {
            token: {
              include: ['symbol', 'amount', 'blockchainName'],
            },
            exchangeRate: {
              include: ['rate'],
            },
          },
        },
      },
    },
  },

  // Purchase responses - minimal by default
  takumipay_create_purchase: {
    fields: {
      include: [
        'id',
        'refId',
        'status',
        'bookingOrderId',
        'transactionId',
      ],
    },
  },

  takumipay_get_purchase_status_by_ref_id: {
    fields: {
      include: ['refId', 'referenceStatus', 'purchase', 'jobs'],
      nested: {
        purchase: {
          include: ['id', 'status', 'refId'],
        },
        jobs: {
          include: ['purchase', 'blockchain', 'vendor'],
          nested: {
            purchase: {
              include: ['id', 'progress', 'failedReason'],
            },
            blockchain: {
              include: ['id', 'progress', 'failedReason'],
            },
            vendor: {
              include: ['id', 'progress', 'failedReason'],
            },
          },
        },
      },
    },
  },

  // ==================== Product Tool Configs ====================
  
  // Product list - exclude heavy metadata, keep essential info for agent
  takumipay_get_products: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
        'cursor',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt', 'description'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  takumipay_search_products: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
        'cursor',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt', 'description'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  takumipay_get_product_by_id: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  takumipay_get_product_by_code: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  takumipay_get_vouchers: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
        'cursor',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt', 'description'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  takumipay_get_non_vouchers: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
        'cursor',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt', 'description'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  takumipay_get_products_grouped_by_categories: {
    fields: {
      nested: {
        category: {
          include: ['id', 'name'],
        },
        products: {
          exclude: [
            ...GLOBAL_EXCLUDED_FIELDS,
            'createdAt',
            'updatedAt',
            'description',
          ],
        },
      },
    },
  },

  takumipay_get_products_by_category: {
    fields: {
      exclude: [
        ...GLOBAL_EXCLUDED_FIELDS,
        'createdAt',
        'updatedAt',
      ],
      nested: {
        category: {
          include: ['id', 'name'],
        },
        variants: {
          exclude: ['createdAt', 'updatedAt', 'description'],
          nested: {
            ProductPrice: {
              include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
            },
          },
        },
      },
    },
  },

  // Categories - minimal metadata
  takumipay_get_categories: {
    fields: {
      exclude: ['createdAt', 'updatedAt', 'imageUrl', 'cursor'],
    },
  },

  takumipay_get_category_by_id: {
    fields: {
      exclude: ['createdAt', 'updatedAt', 'imageUrl'],
      nested: {
        Product: {
          exclude: [
            ...GLOBAL_EXCLUDED_FIELDS,
            'createdAt',
            'updatedAt',
            'description',
          ],
        },
      },
    },
  },

  // Variants - keep pricing info, exclude metadata
  takumipay_get_product_variants: {
    fields: {
      exclude: ['createdAt', 'updatedAt', 'description'],
      nested: {
        ProductPrice: {
          include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
        },
      },
    },
  },

  takumipay_get_variant_by_id: {
    fields: {
      exclude: ['createdAt', 'updatedAt'],
      nested: {
        ProductPrice: {
          include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
        },
        product: {
          exclude: [
            ...GLOBAL_EXCLUDED_FIELDS,
            'createdAt',
            'updatedAt',
          ],
          nested: {
            category: {
              include: ['id', 'name'],
            },
          },
        },
      },
    },
  },

  takumipay_search_variants: {
    fields: {
      exclude: ['createdAt', 'updatedAt', 'description'],
      nested: {
        ProductPrice: {
          include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
        },
        product: {
          exclude: [
            ...GLOBAL_EXCLUDED_FIELDS,
            'createdAt',
            'updatedAt',
          ],
          nested: {
            category: {
              include: ['id', 'name'],
            },
          },
        },
      },
    },
  },

  // Prices - keep essential pricing, exclude vendor info
  takumipay_get_product_prices: {
    fields: {
      include: ['id', 'productVariantId', 'realValue', 'sellPrice', 'currency', 'isActive'],
    },
  },

  // Input fields - keep as-is, usually small
  takumipay_get_product_input_fields: {
    profile: 'standard',
  },

  // ==================== Booking Tool Configs ====================

  takumipay_get_wallet_bookings: {
    fields: {
      exclude: ['createdAt', 'customerInfo'],
      nested: {
        product: {
          include: ['id', 'name', 'variant', 'price'],
          nested: {
            variant: {
              include: ['id', 'name', 'variantCode'],
            },
            price: {
              include: ['amount', 'currency'],
            },
          },
        },
        payment: {
          include: ['token', 'exchangeRate'],
          nested: {
            token: {
              include: ['symbol', 'amount', 'blockchainName'],
            },
            exchangeRate: {
              include: ['rate'],
            },
          },
        },
      },
    },
  },

  takumipay_get_latest_booking: {
    fields: {
      exclude: ['createdAt', 'customerInfo'],
      nested: {
        product: {
          include: ['id', 'name', 'variant', 'price'],
          nested: {
            variant: {
              include: ['id', 'name', 'variantCode'],
            },
            price: {
              include: ['amount', 'currency'],
            },
          },
        },
        payment: {
          include: ['token', 'exchangeRate'],
          nested: {
            token: {
              include: ['symbol', 'amount', 'blockchainName'],
            },
            exchangeRate: {
              include: ['rate'],
            },
          },
        },
      },
    },
  },

  // ==================== Purchase Tool Configs ====================

  takumipay_get_purchases: {
    fields: {
      include: ['id', 'refId', 'status', 'bookingOrderId', 'transactionId', 'productVariantId'],
    },
  },

  takumipay_search_purchases: {
    fields: {
      include: ['id', 'refId', 'status', 'bookingOrderId', 'transactionId', 'productVariantId'],
    },
  },

  takumipay_get_purchase_by_id: {
    fields: {
      include: ['id', 'refId', 'status', 'bookingOrderId', 'transactionId', 'productVariantId'],
    },
  },
};

/**
 * Transform response data based on configuration
 */
export function transformResponse<T>(
  data: T,
  toolName: string,
  overrideConfig?: ToolResponseConfig,
): T {
  const config = overrideConfig ?? TOOL_CONFIGS[toolName] ?? { profile: 'standard' };
  const fieldConfig = config.fields ?? PROFILE_CONFIGS[config.profile ?? 'standard'];
  
  return applyFieldConfig(data, fieldConfig);
}

function applyFieldConfig<T>(data: T, config: FieldConfig): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => applyFieldConfig(item, config)) as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(data as Record<string, unknown>);

    for (const [key, value] of entries) {
      // Check global exclusions first
      if (GLOBAL_EXCLUDED_FIELDS.includes(key)) {
        continue;
      }

      // Check field-specific exclusions
      if (config.exclude?.includes(key)) {
        continue;
      }

      // If include list is specified, only include those fields
      if (config.include && !config.include.includes(key)) {
        continue;
      }

      // Apply nested config if available
      const nestedConfig = config.nested?.[key];
      if (nestedConfig && typeof value === 'object' && value !== null) {
        result[key] = applyFieldConfig(value, nestedConfig);
      } else if (config.transform) {
        result[key] = config.transform(value);
      } else {
        // Recursively apply to nested objects/arrays
        result[key] = applyFieldConfig(value, { exclude: config.exclude });
      }
    }

    return result as T;
  }

  return data;
}

/**
 * Create a success response with transformed data
 */
export function createTransformedResponse(
  data: unknown,
  toolName: string,
  overrideConfig?: ToolResponseConfig,
): { content: [{ type: 'text'; text: string }] } {
  const transformed = transformResponse(data, toolName, overrideConfig);
  return {
    content: [{ type: 'text', text: JSON.stringify(transformed, null, 2) }],
  };
}

/**
 * Register or update a tool's response configuration
 */
export function setToolConfig(toolName: string, config: ToolResponseConfig): void {
  TOOL_CONFIGS[toolName] = config;
}

/**
 * Get current configuration for a tool
 */
export function getToolConfig(toolName: string): ToolResponseConfig | undefined {
  return TOOL_CONFIGS[toolName];
}

/**
 * Add fields to global exclusion list
 */
export function addGlobalExclusions(fields: string[]): void {
  for (const field of fields) {
    if (!GLOBAL_EXCLUDED_FIELDS.includes(field)) {
      GLOBAL_EXCLUDED_FIELDS.push(field);
    }
  }
}

/**
 * Get summary of response size reduction
 */
export function getResponseStats(
  original: unknown,
  transformed: unknown,
): { originalSize: number; transformedSize: number; reduction: string } {
  const originalSize = JSON.stringify(original).length;
  const transformedSize = JSON.stringify(transformed).length;
  const reduction = ((1 - transformedSize / originalSize) * 100).toFixed(1);
  
  return {
    originalSize,
    transformedSize,
    reduction: `${reduction}%`,
  };
}
