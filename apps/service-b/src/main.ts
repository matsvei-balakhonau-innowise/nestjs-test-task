import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  buildRedisMicroserviceOptions,
  type AppConfiguration,
} from '@app/shared';
import { ServiceBModule } from './service-b.module';

async function bootstrap() {
  const app = await NestFactory.create(ServiceBModule);
  const configService = app.get(ConfigService);
  const serviceB =
    configService.getOrThrow<AppConfiguration['serviceB']>('app.serviceB');
  const messaging =
    configService.getOrThrow<AppConfiguration['messaging']>('app.messaging');

  app.connectMicroservice<MicroserviceOptions>(
    buildRedisMicroserviceOptions(messaging),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Service B')
    .setDescription('Event logs, filtered queries, and PDF reports')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.startAllMicroservices();
  await app.listen(serviceB.port, serviceB.host);

  console.log(
    `Service B listening on http://${serviceB.host}:${serviceB.port}`,
  );
  console.log(`Swagger docs: http://localhost:${serviceB.port}/docs`);
  console.log(
    `Redis microservice subscribed at ${messaging.host}:${messaging.port}`,
  );
}

void bootstrap();
