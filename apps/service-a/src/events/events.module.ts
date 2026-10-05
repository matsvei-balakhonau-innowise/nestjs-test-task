import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import type { AppConfiguration } from '@app/shared';
import { EVENT_CLIENT } from './events.constants';
import { EventsController } from './events.controller';
import { EventsPublisherService } from './events-publisher.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: EVENT_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const messaging =
            configService.getOrThrow<AppConfiguration['messaging']>(
              'app.messaging',
            );
          return {
            transport: Transport.REDIS,
            options: {
              host: messaging.host,
              port: messaging.port,
            },
          };
        },
      },
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsPublisherService],
  exports: [EventsPublisherService],
})
export class EventsModule {}
