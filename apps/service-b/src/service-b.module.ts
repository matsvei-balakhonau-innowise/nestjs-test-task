import { Module } from '@nestjs/common';
import { SharedModule } from '@app/shared';
import { HealthModule } from './health/health.module';
import { LogsModule } from './logs/logs.module';

@Module({
  imports: [SharedModule, HealthModule, LogsModule],
})
export class ServiceBModule {}
