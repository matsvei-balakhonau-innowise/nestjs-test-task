import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityPublisher } from '../activity/activity.publisher';
import { CatalogService } from './catalog.service';
import { SearchCatalogDto } from './dto/search-catalog.dto';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly activity: ActivityPublisher,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search imported catalog records (text index + pagination)' })
  async search(@Query() query: SearchCatalogDto) {
    const result = await this.catalog.search(query);
    await this.activity.emit('catalog.search', {
      q: query.q ?? null,
      source: query.source ?? null,
      page: result.page,
      total: result.total,
    });
    return result;
  }
}
