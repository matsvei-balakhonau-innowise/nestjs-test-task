import {
  DynamicModule,
  Global,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { EVENT_BUS_URL } from './event-bus.tokens';

@Global()
@Module({})
export class EventBusModule {
  static register(redisUrl: string): DynamicModule {
    return {
      module: EventBusModule,
      providers: [
        { provide: EVENT_BUS_URL, useValue: redisUrl },
        EventBusService,
      ],
      exports: [EventBusService],
    };
  }

  static registerAsync(options: {
    imports?: DynamicModule['imports'];
    inject?: Array<InjectionToken | OptionalFactoryDependency>;
    useFactory: (...args: never[]) => string | Promise<string>;
  }): DynamicModule {
    return {
      module: EventBusModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: EVENT_BUS_URL,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        EventBusService,
      ],
      exports: [EventBusService],
    };
  }
}
