import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

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
      const snapshot = this.serializeRequest(request)
      this.logger.warn(
        `Missing API key. Raw request snapshot: ${snapshot}`,
      )
      console.warn(`[ApiKeyGuard] Missing API key. Raw request: ${snapshot}`)
      throw new UnauthorizedException('api key needed!')
    }

    if (providedKey !== expectedKey) {
      const snapshot = this.serializeRequest(request)
      this.logger.warn(
        `Invalid API key "${providedKey}". Raw request snapshot: ${snapshot}`,
      )
      console.warn(
        `[ApiKeyGuard] Invalid API key "${providedKey}". Raw request: ${snapshot}`,
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

  private serializeRequest(request: RequestWithHeaders): string {
    try {
      return JSON.stringify(
        {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
        },
        null,
        2,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown serialization error'
      this.logger.error(`Failed to serialize request: ${message}`)
      return '[unserializable request]'
    }
  }
}
