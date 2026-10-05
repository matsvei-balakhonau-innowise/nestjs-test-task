import { Injectable, Logger } from '@nestjs/common';
import { TimeSeriesService } from '@shared/cache';
import { PdfReportBuilder } from './pdf-report.builder';
import type { TimeseriesReportQueryDto } from './dto/timeseries-report-query.dto';

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    private readonly timeSeries: TimeSeriesService,
    private readonly pdfBuilder: PdfReportBuilder,
  ) {}

  async buildTimeseriesPdf(query: TimeseriesReportQueryDto): Promise<{
    filename: string;
    buffer: Buffer;
  }> {
    const toDate = query.to ? new Date(query.to) : new Date();
    const fromDate = query.from
      ? new Date(query.from)
      : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const filters = ['producer=ingest-service'];
    if (query.activity?.trim()) {
      filters.push(`name=${query.activity.trim()}`);
    }

    this.logger.log(
      `Building PDF report filters=${filters.join(',')} from=${fromDate.toISOString()} to=${toDate.toISOString()}`,
    );

    const series = await this.timeSeries.loadMatchingSeries({
      filters,
      from: fromDate.getTime(),
      to: toDate.getTime(),
    });

    // Drop empty series for a cleaner report
    const nonEmpty = series.filter((s) => s.points.length > 0);

    const buffer = await this.pdfBuilder.build({
      title: 'Ingest activity time-series report',
      subtitle: 'audit-service · RedisTimeSeries',
      generatedAt: new Date(),
      windowLabel: `${fromDate.toISOString()} → ${toDate.toISOString()}`,
      series: nonEmpty,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `timeseries-report-${stamp}.pdf`,
      buffer,
    };
  }
}
