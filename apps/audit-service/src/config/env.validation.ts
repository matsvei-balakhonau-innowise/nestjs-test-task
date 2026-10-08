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

export class AuditEnv {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  AUDIT_PORT = 3002;

  @IsString()
  @IsNotEmpty()
  MONGO_URI = 'mongodb://localhost:27017';

  @IsString()
  @IsNotEmpty()
  MONGO_DB_AUDIT = 'nest_audit';

  @IsString()
  @IsNotEmpty()
  REDIS_URL = 'redis://localhost:6379';

  @IsString()
  @IsNotEmpty()
  EVENT_STREAM_KEY = 'stream:ingest:actions';

  @IsString()
  @IsNotEmpty()
  EVENT_GROUP = 'audit-consumers';

  @IsString()
  @IsNotEmpty()
  EVENT_CONSUMER = 'audit-1';

  @IsOptional()
  @IsString()
  INSTANCE_ID?: string;
}

export function validateAuditEnv(config: Record<string, unknown>): AuditEnv {
  const validated = plainToInstance(AuditEnv, config, {
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
    throw new Error(`Invalid audit-service environment: ${details}`);
  }

  return validated;
}
