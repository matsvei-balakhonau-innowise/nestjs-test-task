import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@app/shared';
import { ServiceAModule } from './service-a.module';

async function bootstrap() {
  const app = await NestFactory.create(ServiceAModule);
  const configService = app.get(ConfigService);
  const { host, port } =
    configService.getOrThrow<AppConfiguration['serviceA']>('app.serviceA');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Service A')
    .setDescription(
      'Data ingestion, search, and RedisTimeSeries event publishing',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port, host);
  console.log(`Service A listening on http://${host}:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

void bootstrap();
