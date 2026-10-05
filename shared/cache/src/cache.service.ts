import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { REDIS_URL_TOKEN } from './cache.tokens';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client!: RedisClientType;

  constructor(@Inject(REDIS_URL_TOKEN) private readonly url: string) {}

  async onModuleInit(): Promise<void> {
    this.client = createClient({ url: this.url }) as RedisClientType;
    this.client.on('error', (err: Error) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
    await this.client.connect();
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  raw(): RedisClientType {
    return this.client;
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }
}
