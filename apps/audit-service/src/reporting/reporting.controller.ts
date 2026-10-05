import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { TimeseriesReportQueryDto } from './dto/timeseries-report-query.dto';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@Controller('reporting')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('timeseries.pdf')
  @ApiOperation({
    summary: 'Download PDF report with charts from RedisTimeSeries activity data',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF binary',
    schema: { type: 'string', format: 'binary' },
  })
  @Header('Content-Type', 'application/pdf')
  async timeseriesPdf(
    @Query() query: TimeseriesReportQueryDto,
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.reporting.buildTimeseriesPdf(query);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
