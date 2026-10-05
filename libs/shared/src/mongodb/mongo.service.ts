import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Collection, Db, Document, MongoClient } from 'mongodb';
import { MONGO_CLIENT, MONGO_DB } from './mongo.constants';

@Injectable()
export class MongoService implements OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);

  constructor(
    @Inject(MONGO_CLIENT) private readonly client: MongoClient,
    @Inject(MONGO_DB) private readonly db: Db,
  ) {}

  getDb(): Db {
    return this.db;
  }

  getClient(): MongoClient {
    return this.client;
  }

  collection<TSchema extends Document = Document>(
    name: string,
  ): Collection<TSchema> {
    return this.db.collection<TSchema>(name);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing MongoDB connection');
    await this.client.close();
  }
}
