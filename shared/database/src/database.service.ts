import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Collection, Db, Document, MongoClient } from 'mongodb';
import { DATABASE_NAME, DATABASE_URI } from './database.tokens';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private client!: MongoClient;
  private database!: Db;

  constructor(
    @Inject(DATABASE_URI) private readonly uri: string,
    @Inject(DATABASE_NAME) private readonly dbName: string,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    this.database = this.client.db(this.dbName);
    this.logger.log(`Mongo ready (${this.dbName})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  db(): Db {
    return this.database;
  }

  collection<T extends Document = Document>(name: string): Collection<T> {
    return this.database.collection<T>(name);
  }

  async ping(): Promise<boolean> {
    await this.database.command({ ping: 1 });
    return true;
  }
}
