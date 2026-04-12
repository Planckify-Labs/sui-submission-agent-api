import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('VALKEY_URL')!)
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.setex(key, ttlSeconds, value)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }
}
