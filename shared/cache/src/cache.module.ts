import {
  DynamicModule,
  Global,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
} from '@nestjs/common';
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

  static registerAsync(options: {
    imports?: DynamicModule['imports'];
    inject?: Array<InjectionToken | OptionalFactoryDependency>;
    useFactory: (...args: never[]) => string | Promise<string>;
  }): DynamicModule {
    return {
      module: CacheModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: REDIS_URL_TOKEN,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        CacheService,
        TimeSeriesService,
      ],
      exports: [CacheService, TimeSeriesService],
    };
  }
}
