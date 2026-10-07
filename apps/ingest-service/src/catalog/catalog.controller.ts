import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
  @ApiOkResponse({
    description: 'Paginated catalog hits',
    schema: {
      example: {
        page: 1,
        pageSize: 5,
        total: 126,
        totalPages: 26,
        items: [
          {
            _id: '66f0...',
            source: 'photos.json',
            importedAt: '2026-10-05T10:00:00.000Z',
            payload: {
              albumId: 1,
              id: 1,
              title: 'accusamus beatae ad facilis',
            },
            searchText: '1 1 accusamus beatae ad facilis',
            score: 1.1,
          },
        ],
      },
    },
  })
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a single catalog record by Mongo ObjectId' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId' })
  @ApiOkResponse({
    description: 'Catalog record',
    schema: {
      example: {
        _id: '66f0...',
        source: 'photos.json',
        importedAt: '2026-10-05T10:00:00.000Z',
        payload: { albumId: 1, id: 1, title: 'accusamus beatae ad facilis' },
        searchText: '1 1 accusamus beatae ad facilis',
      },
    },
  })
  async findOne(@Param('id') id: string) {
    const record = await this.catalog.findById(id);
    await this.activity.emit('catalog.get', { id });
    return record;
  }
}
