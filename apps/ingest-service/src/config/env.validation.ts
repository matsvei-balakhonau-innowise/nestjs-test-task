import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class IngestEnv {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  INGEST_PORT = 3001;

  @IsString()
  @IsNotEmpty()
  MONGO_URI = 'mongodb://localhost:27017';

  @IsString()
  @IsNotEmpty()
  MONGO_DB_INGEST = 'nest_ingest';

  @IsString()
  @IsNotEmpty()
  REDIS_URL = 'redis://localhost:6379';

  @IsString()
  @IsNotEmpty()
  EVENT_STREAM_KEY = 'stream:ingest:actions';

  @IsOptional()
  @IsString()
  INSTANCE_ID?: string;

  @IsOptional()
  @IsString()
  PULL_ALLOWED_HOSTS?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1024)
  PULL_MAX_BYTES = 10 * 1024 * 1024;
}

export function validateIngestEnv(config: Record<string, unknown>): IngestEnv {
  const validated = plainToInstance(IngestEnv, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .filter(Boolean)
      .join('; ');
    throw new Error(`Invalid ingest-service environment: ${details}`);
  }

  return validated;
}
