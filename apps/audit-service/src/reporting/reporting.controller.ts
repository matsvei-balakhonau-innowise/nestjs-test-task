import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TimeseriesReportQueryDto } from './dto/timeseries-report-query.dto';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@Controller('reporting')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('timeseries.pdf')
  @ApiOperation({
    summary: 'PDF report (Nest + Chart.js/PDFKit) from RedisTimeSeries',
    description:
      'Builds a multi-page PDF with overview stats and charts. Uses Chart.js when native canvas is available (Docker image), otherwise PDFKit vector charts.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-10-01T00:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-05T23:59:59.000Z' })
  @ApiQuery({ name: 'activity', required: false, example: 'ingestion.pull' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF binary download',
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
