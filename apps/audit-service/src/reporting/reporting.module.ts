import { Module } from '@nestjs/common';
import { PdfReportBuilder } from './pdf-report.builder';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, PdfReportBuilder],
})
export class ReportingModule {}
