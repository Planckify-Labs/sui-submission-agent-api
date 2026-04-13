import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null
  private readonly logger = new Logger(ValkeyService.name)

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('VALKEY_URL')
    if (!url) {
      this.logger.warn('VALKEY_URL not set — cache disabled')
      return
    }
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null
        return Math.min(times * 200, 2000)
      },
      lazyConnect: true,
    })
    this.client.on('error', (err) => {
      this.logger.warn(`Valkey connection error: ${err.message}`)
    })
    this.client.connect().catch(() => {
      this.logger.warn('Could not connect to Valkey — cache disabled')
      this.client?.disconnect()
      this.client = null
    })
  }

  async onModuleDestroy() {
    await this.client?.quit()
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null
    return this.client.get(key)
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (!this.client) return
    await this.client.setex(key, ttlSeconds, value)
  }

  async del(key: string): Promise<void> {
    if (!this.client) return
    await this.client.del(key)
  }
}
