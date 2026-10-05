import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class TimeseriesReportQueryDto {
  @ApiPropertyOptional({
    description: 'ISO start datetime (inclusive). Defaults to 7 days ago.',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'ISO end datetime (inclusive). Defaults to now.',
    example: '2026-10-05T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description: 'Optional activity name filter (RedisTimeSeries label `name`)',
    example: 'ingestion.pull',
  })
  @IsOptional()
  @IsString()
  activity?: string;
}
