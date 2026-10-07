import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import {
  ApiExceptionFilter,
  TracingLogger,
  createTracingMiddleware,
  resolveSwaggerUiPath,
} from '@shared/http';
import { ActivityModule } from './activity/activity.module';
import { CatalogModule } from './catalog/catalog.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { StatusModule } from './status/status.module';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const SERVICE = 'ingest-service';

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
class IngestServiceRootModule {}

async function bootstrap() {
  const instanceId =
    process.env.INSTANCE_ID || `${SERVICE}-${process.pid.toString(36)}`;
  TracingLogger.configure(SERVICE, instanceId);

  const app = await NestFactory.create(IngestServiceRootModule);
  app.use(createTracingMiddleware());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Ingest service')
    .setDescription('Dataset pull, file import, and catalog search')
    .setVersion('0.1.0')
    .addTag('ingestion')
    .addTag('catalog')
    .addTag('activity')
    .addTag('status')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), {
    customSwaggerUiPath: resolveSwaggerUiPath(),
  });

  const port = Number(process.env.INGEST_PORT ?? 3001);
  await app.listen(port);
  console.log(`ingest-service up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
