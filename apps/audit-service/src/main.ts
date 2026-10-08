import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ApiExceptionFilter,
  TracingLogger,
  createTracingMiddleware,
  resolveSwaggerUiPath,
} from '@shared/http';
import { AppModule } from './app.module';

const SERVICE = 'audit-service';

async function bootstrap() {
  const instanceId =
    process.env.INSTANCE_ID || `${SERVICE}-${process.pid.toString(36)}`;
  TracingLogger.configure(SERVICE, instanceId);

  const app = await NestFactory.create(AppModule);

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

  const port = Number(process.env.AUDIT_PORT ?? 3002);
  await app.listen(port);
  console.log(`audit-service up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
