import { DynamicModule, Global, Module } from '@nestjs/common';
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
}
