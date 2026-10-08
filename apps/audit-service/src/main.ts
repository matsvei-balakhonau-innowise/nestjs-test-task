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
import type { AuditEnv } from './config/env.validation';

const SERVICE = 'audit-service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AuditEnv, true>);

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
    .setTitle('Audit service')
    .setDescription('Activity audit trail and reporting (Nest PDF)')
    .setVersion('0.1.0')
    .addTag('audit')
    .addTag('reporting')
    .addTag('status')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), {
    customSwaggerUiPath: resolveSwaggerUiPath(),
  });

  const port = config.get('AUDIT_PORT', { infer: true });
  await app.listen(port);
  console.log(`audit-service up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
