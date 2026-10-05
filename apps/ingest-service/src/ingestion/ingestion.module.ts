import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [ActivityModule, CatalogModule],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
