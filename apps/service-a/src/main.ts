import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CacheModule } from '@shared/cache';
import { DatabaseModule } from '@shared/database';
import { EventBusModule } from '@shared/event-bus';
import { ActivityModule } from './activity/activity.module';
import { StatusModule } from './status/status.module';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

@Module({
  imports: [
    DatabaseModule.register({
      uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
      dbName: process.env.MONGO_DB_A || 'nest_service_a',
    }),
    CacheModule.register(redisUrl),
    EventBusModule.register(redisUrl),
    StatusModule,
    ActivityModule,
  ],
})
class ServiceARootModule {}

async function bootstrap() {
  const app = await NestFactory.create(ServiceARootModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Service A')
    .setDescription('Ingestion / search microservice')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.SERVICE_A_PORT ?? 3001);
  await app.listen(port);
  console.log(`service-a up on :${port} (docs /docs, api /v1)`);
}

void bootstrap();
