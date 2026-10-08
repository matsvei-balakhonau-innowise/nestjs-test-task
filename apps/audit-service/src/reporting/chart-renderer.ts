import { Injectable, Logger } from '@nestjs/common';
import type { LabeledSeries } from '@shared/cache';
import { errorMessage } from '@shared/http';

type CanvasRenderer = {
  renderToBuffer: (config: unknown) => Promise<Buffer>;
};

@Injectable()
export class ChartRenderer {
  private readonly logger = new Logger(ChartRenderer.name);
  private canvas: CanvasRenderer | null = null;
  private initPromise: Promise<void> | null = null;

  get enabled(): boolean {
    return this.canvas != null;
  }

  async renderSeriesLine(series: LabeledSeries): Promise<Buffer | null> {
    await this.ensureCanvas();
    if (!this.canvas) {
      return null;
    }

    const points = [...series.points].sort((a, b) => a.at - b.at);
    const label = series.labels.name || series.key;
    const labels = points.map((p) =>
      new Date(p.at).toISOString().slice(5, 16).replace('T', ' '),
    );
    const values = points.map((p) => p.value);

    return this.canvas.renderToBuffer({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: '#2a9d8f',
            backgroundColor: 'rgba(42, 157, 143, 0.18)',
            fill: true,
            tension: 0.25,
            pointRadius: points.length > 40 ? 0 : 3,
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: `Activity: ${label}`,
            font: { size: 16 },
          },
          legend: { display: true },
        },
        scales: {
          x: {
            title: { display: true, text: 'Time (UTC)' },
            ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 },
          },
          y: {
            title: { display: true, text: 'Count / bucket' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  private ensureCanvas(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initCanvas();
    }
    return this.initPromise;
  }

  private async initCanvas(): Promise<void> {
    try {
      const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
      this.canvas = new ChartJSNodeCanvas({
        width: 720,
        height: 320,
        backgroundColour: 'white',
      });
      this.logger.log('Chart.js canvas renderer enabled');
    } catch (error: unknown) {
      this.logger.warn(
        `Chart.js canvas unavailable (${errorMessage(error)}); using PDFKit charts`,
      );
      this.canvas = null;
    }
  }
}
