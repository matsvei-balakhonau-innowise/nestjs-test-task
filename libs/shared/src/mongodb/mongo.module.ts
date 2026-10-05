import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient } from 'mongodb';
import type { AppConfiguration } from '../config/configuration.types';
import { MONGO_CLIENT, MONGO_DB } from './mongo.constants';
import { MongoService } from './mongo.service';

@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<MongoClient> => {
        const { uri } = configService.getOrThrow<AppConfiguration['mongodb']>('app.mongodb');
        const client = new MongoClient(uri);
        await client.connect();
        return client;
      },
    },
    {
      provide: MONGO_DB,
      inject: [MONGO_CLIENT, ConfigService],
      useFactory: (
        client: MongoClient,
        configService: ConfigService,
      ): Db => {
        const { dbName } =
          configService.getOrThrow<AppConfiguration['mongodb']>('app.mongodb');
        return client.db(dbName);
      },
    },
    MongoService,
  ],
  exports: [MONGO_CLIENT, MONGO_DB, MongoService],
})
export class MongoModule {}
