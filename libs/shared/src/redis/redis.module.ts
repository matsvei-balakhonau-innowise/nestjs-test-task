import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import type { AppConfiguration } from '../config/configuration.types';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import { RedisTimeSeriesService } from './redis-timeseries.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<RedisClientType> => {
        const { url } =
          configService.getOrThrow<AppConfiguration['redis']>('app.redis');
        const client = createClient({ url }) as RedisClientType;
        client.on('error', (error: Error) => {
          console.error('Redis client error', error);
        });
        await client.connect();
        return client;
      },
    },
    RedisService,
    RedisTimeSeriesService,
  ],
  exports: [REDIS_CLIENT, RedisService, RedisTimeSeriesService],
})
export class RedisModule {}
