import { DynamicModule, Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DATABASE_NAME, DATABASE_URI } from './database.tokens';

export interface DatabaseModuleOptions {
  uri: string;
  dbName: string;
}

@Global()
@Module({})
export class DatabaseModule {
  static register(options: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE_URI, useValue: options.uri },
        { provide: DATABASE_NAME, useValue: options.dbName },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }
}
