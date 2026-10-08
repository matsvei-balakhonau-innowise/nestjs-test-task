import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import { AuditModule } from './audit/audit.module';
import { validateAuditEnv, type AuditEnv } from './config/env.validation';
import { ReportingModule } from './reporting/reporting.module';
import { StatusModule } from './status/status.module';
import { StreamListenerModule } from './stream-listener/stream-listener.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateAuditEnv,
    }),
    DatabaseModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AuditEnv, true>) => ({
        uri: config.get('MONGO_URI', { infer: true }),
        dbName: config.get('MONGO_DB_AUDIT', { infer: true }),
      }),
    }),
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AuditEnv, true>) =>
        config.get('REDIS_URL', { infer: true }),
    }),
    EventBusModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AuditEnv, true>) =>
        config.get('REDIS_URL', { infer: true }),
    }),
    StatusModule,
    AuditModule,
    StreamListenerModule,
    ReportingModule,
  ],
})
export class AppModule {}
