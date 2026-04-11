import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

// SECURITY / LOGGING POLICY — see protocol_v1.1.md §14 Guard F.
// Never log raw request headers, body, query, or supplied API keys.
// The request body carries `messages`, tool args, and `wallet_context`
// (PII: voucher codes, balances, redemption details). Headers carry the
// real API key. Log only method + path + auth_outcome.

type RequestWithHeaders = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  query?: Record<string, unknown>
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name)

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>()
    const providedKey = this.extractApiKey(request)
    const expectedKey = this.configService.get<string>('CHAT_API_KEY')

    if (!expectedKey) {
      throw new UnauthorizedException(
        'CHAT_API_KEY is not configured on the server.',
      )
    }

    if (!providedKey) {
      // Redacted: do NOT log headers / body / query — they contain
      // session messages, wallet_context, and the real API key.
      this.logger.warn(
        `Auth failed: missing API key (${this.describeRequest(request)})`,
      )
      throw new UnauthorizedException('api key needed!')
    }

    if (providedKey !== expectedKey) {
      // Redacted: never echo the supplied key or the request body.
      this.logger.warn(
        `Auth failed: invalid API key (${this.describeRequest(request)})`,
      )
      throw new UnauthorizedException('Invalid API key.')
    }

    return true
  }

  private extractApiKey(request: RequestWithHeaders): string | undefined {
    const headerValue = this.firstHeaderValue(request.headers['x-api-key'])
    if (headerValue) {
      return headerValue
    }

    const authorization = this.firstHeaderValue(request.headers['authorization'])
    if (authorization?.toLowerCase().startsWith('bearer ')) {
      return authorization.slice(7).trim()
    }

    if (authorization) {
      return authorization
    }

    const queryKey = this.extractApiKeyFromPayload(request.query)
    if (queryKey) {
      return queryKey
    }

    return this.extractApiKeyFromPayload(request.body)
  }

  private firstHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0]
    }
    return value
  }

  private extractApiKeyFromPayload(
    payload: Record<string, unknown> | unknown,
  ): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }

    const record = payload as Record<string, unknown>
    return (
      this.getStringField(record, 'secrectApiKey') ??
      this.getStringField(record, 'secretApiKey') ??
      this.getStringField(record, 'apiKey') ??
      this.getStringField(record, 'api_key')
    )
  }

  private getStringField(
    record: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = record[key]
    return typeof value === 'string' ? value : undefined
  }

  /**
   * Build a redacted one-liner describing the request for audit logs.
   * Intentionally omits headers, body, query, and any credential material —
   * see protocol_v1.1.md §14 Guard F.
   */
  private describeRequest(request: RequestWithHeaders): string {
    const method = request.method ?? 'UNKNOWN'
    const url = typeof request.url === 'string' ? request.url.split('?')[0] : 'UNKNOWN'
    return `${method} ${url}`
  }
}
