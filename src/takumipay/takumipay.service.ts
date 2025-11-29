import ky, { type KyInstance, HTTPError } from 'ky';

export interface TakumiPayConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface PaginationParams {
  cursor?: string;
  take?: number;
}

export interface SearchProductParams extends PaginationParams {
  query?: string;
  vendorId?: string;
  active?: boolean;
  code?: string;
  id?: string;
  name?: string;
  vendorName?: string;
  isVoucher?: boolean;
}

export interface SearchVariantParams extends PaginationParams {
  query?: string;
  variantCode?: string;
  name?: string;
  productId?: string;
  isActive?: boolean;
}

export interface PaymentDetails {
  tokenAddress: string;
  blockchainId: string;
  exchangeRateId: number;
}

export interface CustomerInfo {
  [key: string]: string | number | boolean | string[];
}

export interface CreateBookingParams {
  walletAddress: string;
  productVariantId: string;
  productPriceId: string;
  payment: PaymentDetails;
  customerInfo?: CustomerInfo;
}

export interface BookingResponse {
  id: string;
  walletAddress: string;
  product: {
    id: string;
    name: string;
    variant: {
      id: string;
      name: string;
      variantCode: string;
    };
    price: {
      amount: number;
      currency: string;
    };
  };
  payment: {
    token: {
      symbol: string;
      address: string;
      amount: string;
      blockchainId: string;
      blockchainName: string;
    };
    exchangeRate: {
      rate: number;
      lockedAt: string;
    };
  };
  customerInfo?: CustomerInfo;
  status: 'PENDING' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED';
  expiresAt: string;
  createdAt: string;
}

export interface BookingQueryParams {
  status?: 'PENDING' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED';
  createdFrom?: string;
  createdTo?: string;
  productId?: string;
}

export interface CreatePurchaseParams {
  refId: string;
  walletAddress: string;
  bookingId: string;
  contractAddress: string;
  networkId: string;
  transactionHash: string;
}

export interface PurchaseResponse {
  id: string;
  transactionId: string;
  productVariantId: string;
  bookingOrderId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  vendorResponse?: unknown;
  vendorRefId?: string;
  refId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchPurchaseParams extends PaginationParams {
  userId?: string;
  transactionId?: string;
  productId?: string;
  vendorId?: string;
  tokenId?: string;
  blockchainId?: string;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
}

export interface PurchaseStatusResponse {
  refId: string;
  referenceStatus: string;
  purchase: PurchaseResponse | null;
  jobs: {
    purchase: JobStatus | null;
    blockchain: JobStatus | null;
    vendor: JobStatus | null;
  };
}

export interface JobStatus {
  id: string;
  progress: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  name: string;
}

export interface ProductPrice {
  id: string;
  productVariantId: string;
  vendorId: string;
  realValue: string;
  priceFromVendor: string;
  sellPrice: string;
  isActive: boolean;
  currency: string;
  vendor: Vendor;
}

export interface ProductVariant {
  id: string;
  name: string;
  description?: string;
  variantCode: string;
  productId: string;
  isActive: boolean;
  ProductPrice: ProductPrice[];
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  code: string;
  categoryId: string;
  isActive: boolean;
  isVoucher: boolean;
  createdAt: string;
  updatedAt: string;
  category: Category;
  variants: ProductVariant[];
}

export interface CategoryWithProducts {
  category: {
    id: string;
    name: string;
  };
  products: Omit<Product, 'category' | 'variants'>[];
}

export interface ProductInputField {
  productId: string;
  productName: string;
  forms: unknown[];
}

export class TakumiPayServiceError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'TakumiPayServiceError';
  }
}

export class TakumiPayService {
  private client: KyInstance;

  constructor(config: TakumiPayConfig) {
    this.client = ky.create({
      prefixUrl: config.baseUrl,
      timeout: config.timeout ?? 30000,
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      hooks: {
        beforeError: [
          async (error) => {
            const { response } = error;
            if (response) {
              try {
                const body = await response.json();
                error.message = (body as { message?: string }).message || error.message;
              } catch {
                console.warn('TakumiPayService: Response body is not valid JSON');
              }
            }
            return error;
          },
        ],
      },
    });
  }

  private buildSearchParams(params: Record<string, unknown>): URLSearchParams {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    }
    return searchParams;
  }

  private async handleRequest<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } catch (error) {
      if (error instanceof HTTPError) {
        const statusCode = error.response.status;
        let details: unknown;
        try {
          details = await error.response.json();
        } catch {
          details = error.message;
        }
        throw new TakumiPayServiceError(
          `TakumiPay API error: ${error.message}`,
          statusCode,
          details,
        );
      }
      throw new TakumiPayServiceError(
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    }
  }

  async getProducts(pagination?: PaginationParams): Promise<Product[]> {
    const searchParams = this.buildSearchParams({ ...pagination });
    return this.handleRequest(
      this.client.get('products', { searchParams }).json<Product[]>(),
    );
  }

  async searchProducts(params: SearchProductParams): Promise<Product[]> {
    const searchParams = this.buildSearchParams({ ...params });
    return this.handleRequest(
      this.client.get('products/search', { searchParams }).json<Product[]>(),
    );
  }

  async getProductById(id: string): Promise<Product> {
    return this.handleRequest(
      this.client.get(`products/${id}`).json<Product>(),
    );
  }

  async getProductByCode(code: string): Promise<Product> {
    return this.handleRequest(
      this.client.get(`products/codes/${code}`).json<Product>(),
    );
  }

  async getVouchers(pagination?: PaginationParams): Promise<Product[]> {
    const searchParams = this.buildSearchParams({ ...pagination });
    return this.handleRequest(
      this.client.get('products/vouchers', { searchParams }).json<Product[]>(),
    );
  }

  async getNonVouchers(pagination?: PaginationParams): Promise<Product[]> {
    const searchParams = this.buildSearchParams({ ...pagination });
    return this.handleRequest(
      this.client.get('products/non-vouchers', { searchParams }).json<Product[]>(),
    );
  }

  async getProductsGroupedByCategories(take?: number): Promise<CategoryWithProducts[]> {
    const searchParams = take ? this.buildSearchParams({ take }) : undefined;
    return this.handleRequest(
      this.client.get('products/grouped-by-categories', { searchParams }).json<CategoryWithProducts[]>(),
    );
  }

  async getProductsByCategory(categoryId: string): Promise<Product[]> {
    return this.handleRequest(
      this.client.get(`products/categories/${categoryId}/products`).json<Product[]>(),
    );
  }

  async getCategories(pagination?: PaginationParams): Promise<Category[]> {
    const searchParams = this.buildSearchParams({ ...pagination });
    return this.handleRequest(
      this.client.get('products/categories', { searchParams }).json<Category[]>(),
    );
  }

  async getCategoryById(id: string): Promise<Category & { Product: Product[] }> {
    return this.handleRequest(
      this.client.get(`products/categories/${id}`).json<Category & { Product: Product[] }>(),
    );
  }

  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return this.handleRequest(
      this.client.get(`products/${productId}/variants`).json<ProductVariant[]>(),
    );
  }

  async getVariantById(variantId: string): Promise<ProductVariant & { product: Product }> {
    return this.handleRequest(
      this.client.get(`products/variants/${variantId}`).json<ProductVariant & { product: Product }>(),
    );
  }

  async searchVariants(params: SearchVariantParams): Promise<(ProductVariant & { product: Product })[]> {
    const searchParams = this.buildSearchParams({ ...params });
    return this.handleRequest(
      this.client.get('products/variants/search', { searchParams }).json<(ProductVariant & { product: Product })[]>(),
    );
  }

  async getProductInputFields(productId: string): Promise<ProductInputField> {
    return this.handleRequest(
      this.client.get(`products/${productId}/input-fields`).json<ProductInputField>(),
    );
  }

  async getProductPrices(productId: string): Promise<ProductPrice[]> {
    return this.handleRequest(
      this.client.get(`products/${productId}/prices`).json<ProductPrice[]>(),
    );
  }

  async createBooking(params: CreateBookingParams): Promise<BookingResponse> {
    return this.handleRequest(
      this.client.post('bookings', { json: params }).json<BookingResponse>(),
    );
  }

  async getWalletBookings(
    walletAddress: string,
    query?: BookingQueryParams,
  ): Promise<BookingResponse[]> {
    const searchParams = query ? this.buildSearchParams({ ...query }) : undefined;
    return this.handleRequest(
      this.client.get(`bookings/wallet/${walletAddress}`, { searchParams }).json<BookingResponse[]>(),
    );
  }

  async getLatestBooking(walletAddress: string): Promise<BookingResponse | null> {
    return this.handleRequest(
      this.client.get(`bookings/wallet/${walletAddress}/latest`).json<BookingResponse | null>(),
    );
  }

  async getBookingStats(walletAddress: string): Promise<{
    total: number;
    pending: number;
    executed: number;
    expired: number;
    cancelled: number;
    conversionRate: number;
    avgTimeToExecution?: number;
    expirationRate: number;
  }> {
    return this.handleRequest(
      this.client.get(`bookings/wallet/${walletAddress}/stats`).json(),
    );
  }

  async executeBooking(bookingId: string): Promise<BookingResponse> {
    return this.handleRequest(
      this.client.put(`bookings/${bookingId}/execute`).json<BookingResponse>(),
    );
  }

  async cancelBooking(bookingId: string): Promise<BookingResponse> {
    return this.handleRequest(
      this.client.put(`bookings/${bookingId}/cancel`).json<BookingResponse>(),
    );
  }

  async createPurchase(params: CreatePurchaseParams): Promise<PurchaseResponse> {
    return this.handleRequest(
      this.client.post('purchases', { json: params }).json<PurchaseResponse>(),
    );
  }

  async getPurchases(pagination?: PaginationParams): Promise<PurchaseResponse[]> {
    const searchParams = this.buildSearchParams({ ...pagination });
    return this.handleRequest(
      this.client.get('purchases', { searchParams }).json<PurchaseResponse[]>(),
    );
  }

  async searchPurchases(params: SearchPurchaseParams): Promise<PurchaseResponse[]> {
    const searchParams = this.buildSearchParams({ ...params });
    return this.handleRequest(
      this.client.get('purchases/search', { searchParams }).json<PurchaseResponse[]>(),
    );
  }

  async getPurchaseById(id: string, includeVendorResponse = false): Promise<PurchaseResponse> {
    const searchParams = includeVendorResponse 
      ? this.buildSearchParams({ vendorResponse: 'true' })
      : undefined;
    return this.handleRequest(
      this.client.get(`purchases/${id}`, { searchParams }).json<PurchaseResponse>(),
    );
  }

  async getPurchasesByUser(userId: string, pagination?: PaginationParams): Promise<PurchaseResponse[]> {
    const searchParams = this.buildSearchParams({ ...pagination });
    return this.handleRequest(
      this.client.get(`purchases/user/${userId}`, { searchParams }).json<PurchaseResponse[]>(),
    );
  }

  async getPurchaseStatusByRefId(refId: string): Promise<PurchaseStatusResponse> {
    return this.handleRequest(
      this.client.get(`purchases/ref/${refId}/status`).json<PurchaseStatusResponse>(),
    );
  }
}

export function createTakumiPayService(): TakumiPayService {
  const baseUrl = process.env.TAKUMIPAY_API_URL;
  const apiKey = process.env.TAKUMIPAY_API_KEY;

  if (!baseUrl) {
    throw new TakumiPayServiceError(
      'TAKUMIPAY_API_URL environment variable is not set',
    );
  }

  if (!apiKey) {
    throw new TakumiPayServiceError(
      'TAKUMIPAY_API_KEY environment variable is not set',
    );
  }

  return new TakumiPayService({ baseUrl, apiKey });
}

