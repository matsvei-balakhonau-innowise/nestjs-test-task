import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { MongoModule } from './mongodb/mongo.module';
import { RedisModule } from './redis/redis.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env'],
    }),
    MongoModule,
    RedisModule,
  ],
  exports: [ConfigModule, MongoModule, RedisModule],
})
export class SharedModule {}
