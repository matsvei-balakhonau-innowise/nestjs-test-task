import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export enum ExportFormat {
  JSON = 'json',
  EXCEL = 'excel',
}

export class PullDatasetDto {
  @ApiProperty({
    description: 'Public HTTP(S) API that returns JSON (array or object)',
    example: 'https://jsonplaceholder.typicode.com/photos',
  })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url!: string;

  @ApiPropertyOptional({
    enum: ExportFormat,
    default: ExportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat = ExportFormat.JSON;

  @ApiPropertyOptional({
    description: 'Base filename without extension (letters, digits, _ and -)',
    example: 'photos_export',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'filename may only contain letters, numbers, underscores and hyphens',
  })
  filename?: string;
}
