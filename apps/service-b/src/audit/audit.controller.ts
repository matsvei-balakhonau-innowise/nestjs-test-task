import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditStore } from './audit.store';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditStore: AuditStore) {}

  @Get()
  @ApiOperation({ summary: 'Search ingested activity audit entries' })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'producer', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO datetime' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO datetime' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async search(
    @Query('name') name?: string,
    @Query('producer') producer?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const items = await this.auditStore.search({
      name,
      producer,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return { total: items.length, items };
  }
}
