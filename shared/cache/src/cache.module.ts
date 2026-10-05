import { DynamicModule, Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { REDIS_URL_TOKEN } from './cache.tokens';
import { TimeSeriesService } from './time-series.service';

@Global()
@Module({})
export class CacheModule {
  static register(redisUrl: string): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        { provide: REDIS_URL_TOKEN, useValue: redisUrl },
        CacheService,
        TimeSeriesService,
      ],
      exports: [CacheService, TimeSeriesService],
    };
  }
}
