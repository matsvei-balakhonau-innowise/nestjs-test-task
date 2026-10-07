import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditStore } from './audit.store';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditStore: AuditStore) {}

  @Get()
  @ApiOperation({
    summary: 'Search ingested activity audit entries',
    description:
      'Filter by event name/type, producer, and date range. `type` is an alias for `name`.',
  })
  @ApiQuery({ name: 'name', required: false, description: 'Event name, e.g. ingestion.pull' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Alias for `name` (task wording: filter by type)',
  })
  @ApiQuery({ name: 'producer', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO datetime' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO datetime' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({
    description: 'Paginated audit entries with full filtered total',
    schema: {
      example: {
        total: 42,
        limit: 5,
        offset: 0,
        items: [
          {
            eventId: '…',
            name: 'ingestion.pull',
            producer: 'ingest-service',
            occurredAt: '2026-10-05T10:00:00.000Z',
            body: { recordCount: 5000 },
          },
        ],
      },
    },
  })
  async search(
    @Query('name') name?: string,
    @Query('type') type?: string,
    @Query('producer') producer?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditStore.search({
      name: name || type,
      producer,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
