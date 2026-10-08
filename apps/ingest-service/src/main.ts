import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ApiExceptionFilter,
  TracingLogger,
  createTracingMiddleware,
  resolveSwaggerUiPath,
} from '@shared/http';
import { AppModule } from './app.module';
import type { IngestEnv } from './config/env.validation';

const SERVICE = 'ingest-service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<IngestEnv, true>);

  TracingLogger.configure(
    SERVICE,
    config.get('INSTANCE_ID', { infer: true }) ||
      `${SERVICE}-${process.pid.toString(36)}`,
  );

  app.use(createTracingMiddleware());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
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

  const port = config.get('INGEST_PORT', { infer: true });
  await app.listen(port);
  console.log(`ingest-service up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
