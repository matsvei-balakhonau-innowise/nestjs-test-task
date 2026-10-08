import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditStore } from './audit.store';
import { SearchAuditDto } from './dto/search-audit.dto';

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
  async search(@Query() query: SearchAuditDto) {
    return this.auditStore.search({
      name: query.name || query.type,
      producer: query.producer,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
