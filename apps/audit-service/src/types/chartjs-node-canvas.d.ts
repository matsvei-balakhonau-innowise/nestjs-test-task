declare module 'chartjs-node-canvas' {
  export class ChartJSNodeCanvas {
    constructor(options: {
      width: number;
      height: number;
      backgroundColour?: string;
    });

    renderToBuffer(configuration: unknown): Promise<Buffer>;
  }
}
