import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import { AuditModule } from './audit/audit.module';
import { ReportingModule } from './reporting/reporting.module';
import { StatusModule } from './status/status.module';
import { StreamListenerModule } from './stream-listener/stream-listener.module';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

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
  const app = await NestFactory.create(AuditServiceRootModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Audit service')
    .setDescription('Activity audit trail and reporting')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.AUDIT_PORT ?? 3002);
  await app.listen(port);
  console.log(`audit-service up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
