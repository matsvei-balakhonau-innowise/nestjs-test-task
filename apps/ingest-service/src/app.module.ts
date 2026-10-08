import { Module } from '@nestjs/common';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import { ActivityModule } from './activity/activity.module';
import { CatalogModule } from './catalog/catalog.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { StatusModule } from './status/status.module';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

@Module({
  imports: [
    DatabaseModule.register({
      uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
      dbName: process.env.MONGO_DB_INGEST || 'nest_ingest',
    }),
    CacheModule.register(redisUrl),
    EventBusModule.register(redisUrl),
    StatusModule,
    ActivityModule,
    CatalogModule,
    IngestionModule,
  ],
})
export class AppModule {}
