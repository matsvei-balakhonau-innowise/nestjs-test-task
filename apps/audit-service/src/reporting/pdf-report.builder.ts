import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { LabeledSeries } from '@shared/cache';
import { ChartRenderer } from './chart-renderer';

type SeriesStats = {
  samples: number;
  total: number;
  average: number;
  min: number;
  max: number;
};

@Injectable()
export class PdfReportBuilder {
  constructor(private readonly charts: ChartRenderer) {}

  async build(options: {
    title: string;
    subtitle: string;
    generatedAt: Date;
    windowLabel: string;
    series: LabeledSeries[];
  }): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: {
        Title: options.title,
        Author: 'audit-service',
        Subject: 'RedisTimeSeries activity report',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.drawCover(doc, options);

    if (options.series.length === 0) {
      doc.moveDown(2);
      doc.fontSize(12).fillColor('#444444').text('No time-series samples in this window.', {
        align: 'center',
      });
      doc.end();
      return done;
    }

    this.drawOverviewTable(doc, options.series);

    for (const item of options.series) {
      doc.addPage();
      await this.drawSeriesPage(doc, item);
    }

    doc.addPage();
    this.drawClosing(doc, options.series);

    doc.end();
    return done;
  }

  private drawCover(
    doc: PDFKit.PDFDocument,
    options: {
      title: string;
      subtitle: string;
      generatedAt: Date;
      windowLabel: string;
    },
  ): void {
    doc.rect(0, 0, doc.page.width, 120).fill('#0f3d4c');
    doc
      .fillColor('#ffffff')
      .fontSize(22)
      .text(options.title, 48, 40, { width: doc.page.width - 96 });
    doc.fontSize(11).fillColor('#d7e8ee').text(options.subtitle, 48, 72);

    doc.moveDown(4);
    doc.fillColor('#1a1a1a').fontSize(12);
    doc.text(`Report window: ${options.windowLabel}`);
    doc.text(`Generated: ${options.generatedAt.toISOString()}`);
    doc.text('Source: RedisTimeSeries keys labeled producer=ingest-service');
    doc.moveDown();
    doc
      .fontSize(10)
      .fillColor('#555555')
      .text(
        'Each ingest-service API action increments a labeled series (ts:ingest:<activity>). This report aggregates those series for the selected window.',
        { width: doc.page.width - 96 },
      );
  }

  private drawOverviewTable(doc: PDFKit.PDFDocument, series: LabeledSeries[]): void {
    doc.moveDown(1.5);
    doc.fillColor('#0f3d4c').fontSize(16).text('Overview');
    doc.moveDown(0.5);

    const startY = doc.y;
    const colX = [48, 220, 300, 380, 460];
    doc.fontSize(9).fillColor('#666666');
    ['Activity', 'Samples', 'Total', 'Avg', 'Max'].forEach((header, i) => {
      doc.text(header, colX[i], startY, { width: 70 });
    });
    doc
      .moveTo(48, startY + 14)
      .lineTo(doc.page.width - 48, startY + 14)
      .strokeColor('#cccccc')
      .stroke();

    let y = startY + 22;
    doc.fillColor('#222222').fontSize(10);
    for (const item of series) {
      const stats = this.stats(item.points);
      const name = item.labels.name || item.key;
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 48;
      }
      doc.text(name, colX[0], y, { width: 160 });
      doc.text(String(stats.samples), colX[1], y);
      doc.text(stats.total.toFixed(0), colX[2], y);
      doc.text(stats.average.toFixed(2), colX[3], y);
      doc.text(String(stats.max), colX[4], y);
      y += 18;
    }
  }

  private async drawSeriesPage(
    doc: PDFKit.PDFDocument,
    item: LabeledSeries,
  ): Promise<void> {
    const name = item.labels.name || item.key;
    const stats = this.stats(item.points);

    doc.fillColor('#0f3d4c').fontSize(16).text(name);
    doc.moveDown(0.3);
    doc.fillColor('#555555').fontSize(10);
    doc.text(`Redis key: ${item.key}`);
    doc.text(
      `Labels: ${Object.entries(item.labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || '—'}`,
    );
    doc.moveDown(0.6);

    doc.fillColor('#1a1a1a').fontSize(11);
    doc.text(
      `Samples ${stats.samples}   ·   Total ${stats.total.toFixed(0)}   ·   Avg ${stats.average.toFixed(2)}   ·   Min ${stats.min}   ·   Max ${stats.max}`,
    );
    doc.moveDown(1);

    const chartImage = await this.charts.renderSeriesLine(item);
    if (chartImage) {
      doc
        .fillColor('#0f3d4c')
        .fontSize(12)
        .text('Chart.js trend (labels on axes)');
      doc.moveDown(0.3);
      doc.image(chartImage, {
        fit: [doc.page.width - 96, 240],
        align: 'center',
      });
      doc.moveDown(1);
      this.drawBarChart(doc, item);
      return;
    }

    this.drawBarChart(doc, item);
    doc.moveDown(1.2);
    this.drawSparkline(doc, item);
  }

  private drawBarChart(doc: PDFKit.PDFDocument, item: LabeledSeries): void {
    const points = [...item.points].sort((a, b) => a.at - b.at);
    const chartX = 48;
    const chartY = doc.y;
    const chartW = doc.page.width - 96;
    const chartH = 160;

    doc.fillColor('#0f3d4c').fontSize(12).text('Volume by sample (bar)', chartX, chartY);
    const plotTop = chartY + 22;

    doc
      .rect(chartX, plotTop, chartW, chartH)
      .strokeColor('#dddddd')
      .stroke();

    if (points.length === 0) {
      doc
        .fillColor('#888888')
        .fontSize(10)
        .text('No points', chartX + 12, plotTop + chartH / 2);
      doc.y = plotTop + chartH + 8;
      return;
    }

    const maxVal = Math.max(...points.map((p) => p.value), 1);
    const gap = 2;
    const barW = Math.max(2, (chartW - gap * points.length) / points.length);

    points.forEach((point, index) => {
      const h = (point.value / maxVal) * (chartH - 8);
      const x = chartX + index * (barW + gap);
      const y = plotTop + chartH - h;
      doc.rect(x, y, barW, h).fill('#2a9d8f');
    });

    // axis labels
    doc.fillColor('#666666').fontSize(8);
    doc.text(String(maxVal), chartX - 2, plotTop - 2, { width: 40, align: 'left' });
    doc.text('0', chartX - 2, plotTop + chartH - 8);
    const first = new Date(points[0].at).toISOString().slice(0, 16).replace('T', ' ');
    const last = new Date(points[points.length - 1].at)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
    doc.text(first, chartX, plotTop + chartH + 4, { width: chartW / 2 });
    doc.text(last, chartX + chartW / 2, plotTop + chartH + 4, {
      width: chartW / 2,
      align: 'right',
    });

    doc.y = plotTop + chartH + 24;
  }

  private drawSparkline(doc: PDFKit.PDFDocument, item: LabeledSeries): void {
    const points = [...item.points].sort((a, b) => a.at - b.at);
    const chartX = 48;
    const chartY = doc.y;
    const chartW = doc.page.width - 96;
    const chartH = 110;

    doc.fillColor('#0f3d4c').fontSize(12).text('Trend (line)', chartX, chartY);
    const plotTop = chartY + 22;

    doc.rect(chartX, plotTop, chartW, chartH).strokeColor('#dddddd').stroke();

    if (points.length < 2) {
      doc
        .fillColor('#888888')
        .fontSize(10)
        .text('Need at least 2 samples for a trend line', chartX + 12, plotTop + 40);
      doc.y = plotTop + chartH + 8;
      return;
    }

    const maxVal = Math.max(...points.map((p) => p.value), 1);
    const minAt = points[0].at;
    const maxAt = points[points.length - 1].at || minAt + 1;

    doc.strokeColor('#e76f51').lineWidth(1.5);
    points.forEach((point, index) => {
      const x =
        chartX + ((point.at - minAt) / Math.max(maxAt - minAt, 1)) * chartW;
      const y = plotTop + chartH - (point.value / maxVal) * (chartH - 8);
      if (index === 0) {
        doc.moveTo(x, y);
      } else {
        doc.lineTo(x, y);
      }
    });
    doc.stroke();

    doc.fillColor('#666666').fontSize(8);
    doc.text('time →', chartX, plotTop + chartH + 4);
    doc.text('value ↑', chartX, plotTop - 2);
    doc.y = plotTop + chartH + 20;
  }

  private drawClosing(doc: PDFKit.PDFDocument, series: LabeledSeries[]): void {
    doc.fillColor('#0f3d4c').fontSize(16).text('Summary');
    doc.moveDown(0.5);
    doc.fillColor('#222222').fontSize(11);

    const totals = series.reduce(
      (acc, item) => {
        const s = this.stats(item.points);
        acc.samples += s.samples;
        acc.total += s.total;
        return acc;
      },
      { samples: 0, total: 0 },
    );

    doc.text(`Series covered: ${series.length}`);
    doc.text(`Total samples: ${totals.samples}`);
    doc.text(`Sum of recorded values: ${totals.total.toFixed(0)}`);
    doc.moveDown();
    doc.fontSize(10).fillColor('#555555');
    doc.text('Top activities by sample count:');
    const ranked = [...series]
      .map((item) => ({
        name: item.labels.name || item.key,
        samples: item.points.length,
      }))
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 8);

    ranked.forEach((row, index) => {
      doc.text(`${index + 1}. ${row.name} — ${row.samples} samples`);
    });
  }

  private stats(points: Array<{ value: number }>): SeriesStats {
    if (points.length === 0) {
      return { samples: 0, total: 0, average: 0, min: 0, max: 0 };
    }
    const values = points.map((p) => p.value);
    const total = values.reduce((a, b) => a + b, 0);
    return {
      samples: values.length,
      total,
      average: total / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
}
