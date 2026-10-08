import {
  DynamicModule,
  Global,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
} from '@nestjs/common';
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

  static registerAsync(options: {
    imports?: DynamicModule['imports'];
    inject?: Array<InjectionToken | OptionalFactoryDependency>;
    useFactory: (
      ...args: never[]
    ) => DatabaseModuleOptions | Promise<DatabaseModuleOptions>;
  }): DynamicModule {
    const OPTIONS = 'DATABASE_MODULE_OPTIONS';

    return {
      module: DatabaseModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: DATABASE_URI,
          useFactory: (opts: DatabaseModuleOptions) => opts.uri,
          inject: [OPTIONS],
        },
        {
          provide: DATABASE_NAME,
          useFactory: (opts: DatabaseModuleOptions) => opts.dbName,
          inject: [OPTIONS],
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }
}
