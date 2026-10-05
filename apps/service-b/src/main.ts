import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import { AuditModule } from './audit/audit.module';
import { StatusModule } from './status/status.module';
import { StreamListenerModule } from './stream-listener/stream-listener.module';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

@Module({
  imports: [
    DatabaseModule.register({
      uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
      dbName: process.env.MONGO_DB_B || 'nest_service_b',
    }),
    CacheModule.register(redisUrl),
    EventBusModule.register(redisUrl),
    StatusModule,
    AuditModule,
    StreamListenerModule,
  ],
})
class ServiceBRootModule {}

async function bootstrap() {
  const app = await NestFactory.create(ServiceBRootModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Service B')
    .setDescription('Audit log / reporting microservice')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.SERVICE_B_PORT ?? 3002);
  await app.listen(port);
  console.log(`service-b up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
