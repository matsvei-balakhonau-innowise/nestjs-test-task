import { Module } from '@nestjs/common';
import { SharedModule } from '@app/shared';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [SharedModule, HealthModule, EventsModule],
})
export class ServiceAModule {}
