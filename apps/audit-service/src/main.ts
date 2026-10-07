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
import { AuditModule } from './audit/audit.module';
import { ReportingModule } from './reporting/reporting.module';
import { StatusModule } from './status/status.module';
import { StreamListenerModule } from './stream-listener/stream-listener.module';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const SERVICE = 'audit-service';

@Module({
  imports: [
    DatabaseModule.register({
      uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
      dbName: process.env.MONGO_DB_AUDIT || 'nest_audit',
    }),
    CacheModule.register(redisUrl),
    EventBusModule.register(redisUrl),
    StatusModule,
    AuditModule,
    StreamListenerModule,
    ReportingModule,
  ],
})
class AuditServiceRootModule {}

async function bootstrap() {
  const instanceId =
    process.env.INSTANCE_ID || `${SERVICE}-${process.pid.toString(36)}`;
  TracingLogger.configure(SERVICE, instanceId);

  const app = await NestFactory.create(AuditServiceRootModule);
  app.use(createTracingMiddleware());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
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
