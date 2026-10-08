import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import { ActivityModule } from './activity/activity.module';
import { CatalogModule } from './catalog/catalog.module';
import { validateIngestEnv, type IngestEnv } from './config/env.validation';
import { IngestionModule } from './ingestion/ingestion.module';
import { StatusModule } from './status/status.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateIngestEnv,
    }),
    DatabaseModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<IngestEnv, true>) => ({
        uri: config.get('MONGO_URI', { infer: true }),
        dbName: config.get('MONGO_DB_INGEST', { infer: true }),
      }),
    }),
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<IngestEnv, true>) =>
        config.get('REDIS_URL', { infer: true }),
    }),
    EventBusModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<IngestEnv, true>) =>
        config.get('REDIS_URL', { infer: true }),
    }),
    StatusModule,
    ActivityModule,
    CatalogModule,
    IngestionModule,
  ],
})
export class AppModule {}
