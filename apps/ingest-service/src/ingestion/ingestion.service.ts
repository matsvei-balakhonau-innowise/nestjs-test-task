import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import { createWriteStream } from 'fs';
import { access, mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import ExcelJS from 'exceljs';
import { ExportFormat } from './dto/pull-dataset.dto';

const FETCH_TIMEOUT_MS = 60_000;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly storageDir = path.join(process.cwd(), 'storage');
  private readonly uploadsDir = path.join(process.cwd(), 'uploads');

  async ensureDirs(): Promise<void> {
    await mkdir(this.storageDir, { recursive: true });
    await mkdir(this.uploadsDir, { recursive: true });
  }

  getUploadsDir(): string {
    return this.uploadsDir;
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  async pullAndPersist(options: {
    url: string;
    format: ExportFormat;
    filename?: string;
  }): Promise<{
    absolutePath: string;
    relativePath: string;
    format: ExportFormat;
    recordCount: number;
    bytesWritten: number;
  }> {
    await this.ensureDirs();

    const payload = await this.fetchJson(options.url);
    const rows = this.normalizeToRows(payload);

    if (rows.length === 0) {
      throw new BadRequestException('Remote API returned no records');
    }

    const base =
      options.filename?.trim() ||
      `dataset_${new Date().toISOString().replace(/[:.]/g, '-')}`;

    if (options.format === ExportFormat.EXCEL) {
      const absolutePath = path.join(this.storageDir, `${base}.xlsx`);
      await this.writeExcel(rows, absolutePath);
      const { size } = await this.statSafe(absolutePath);

      return {
        absolutePath,
        relativePath: path.relative(process.cwd(), absolutePath),
        format: ExportFormat.EXCEL,
        recordCount: rows.length,
        bytesWritten: size,
      };
    }

    const absolutePath = path.join(this.storageDir, `${base}.json`);
    const serialized = JSON.stringify(rows, null, 2);
    await writeFile(absolutePath, serialized, 'utf8');

    return {
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath),
      format: ExportFormat.JSON,
      recordCount: rows.length,
      bytesWritten: Buffer.byteLength(serialized, 'utf8'),
    };
  }

  async readRecordsFromFile(absolutePath: string): Promise<Record<string, unknown>[]> {
    try {
      await access(absolutePath);
    } catch {
      throw new BadRequestException(`File not found: ${absolutePath}`);
    }

    const ext = path.extname(absolutePath).toLowerCase();
    if (ext === '.json') {
      return this.parseJsonFile(absolutePath);
    }
    if (ext === '.xlsx' || ext === '.xls') {
      return this.parseExcelFile(absolutePath);
    }

    throw new BadRequestException(
      `Unsupported file type "${ext}". Use .json or .xlsx`,
    );
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new BadRequestException(
          `Upstream responded ${response.status} for ${url}`,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();

      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new BadRequestException(
          `Upstream body is not valid JSON (content-type: ${contentType || 'unknown'})`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RequestTimeoutException(
          `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s for ${url}`,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to fetch ${url}: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeToRows(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.map((item, index) => this.asRecord(item, index));
    }

    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;

      for (const key of ['data', 'products', 'items', 'results', 'records']) {
        if (Array.isArray(obj[key])) {
          return (obj[key] as unknown[]).map((item, index) =>
            this.asRecord(item, index),
          );
        }
      }

      return [this.asRecord(obj, 0)];
    }

    throw new BadRequestException('Unsupported JSON shape from upstream API');
  }

  private asRecord(value: unknown, index: number): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return { value, _index: index };
  }

  private async writeExcel(
    rows: Record<string, unknown>[],
    absolutePath: string,
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ingest-service';
    const sheet = workbook.addWorksheet('dataset');

    const headers = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>()),
    );

    sheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.min(Math.max(header.length + 2, 12), 40),
    }));

    for (const row of rows) {
      const flat: Record<string, string | number | boolean | null> = {};

      for (const header of headers) {
        const value = row[header];

        if (value == null) {
          flat[header] = null;
        } else if (typeof value === 'object') {
          flat[header] = JSON.stringify(value);
        } else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          flat[header] = value;
        } else {
          flat[header] = String(value);
        }
      }

      sheet.addRow(flat);
    }

    sheet.getRow(1).font = { bold: true };

    try {
      await workbook.xlsx.writeFile(absolutePath);
    } catch (error: unknown) {
      this.logger.error(`Excel write failed: ${String(error)}`);
      throw new InternalServerErrorException('Could not write Excel file');
    }
  }

  private async parseJsonFile(
    absolutePath: string,
  ): Promise<Record<string, unknown>[]> {
    const { readFile } = await import('fs/promises');
    const raw = await readFile(absolutePath, 'utf8');

    if (!raw.trim()) {
      throw new BadRequestException('Uploaded JSON file is empty');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Invalid JSON: ${message}`);
    }

    return this.normalizeToRows(parsed);
  }

  private async parseExcelFile(
    absolutePath: string,
  ): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absolutePath);
    const sheet = workbook.worksheets[0];

    if (!sheet) {
      throw new BadRequestException('Excel workbook has no worksheets');
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];

    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? `col_${col}`);
    });

    if (headers.length === 0) {
      throw new BadRequestException('Excel sheet has no header row');
    }

    const rows: Record<string, unknown>[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1).value;
        record[header] = this.excelCellToJson(cell);
      });

      rows.push(record);
    });

    if (rows.length === 0) {
      throw new BadRequestException('Excel sheet contains no data rows');
    }

    return rows;
  }

  private excelCellToJson(value: ExcelJS.CellValue): unknown {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'object') {
      return value;
    }

    const record = value as unknown as Record<string, unknown>;
    if ('richText' in record && Array.isArray(record.richText)) {
      return (record.richText as Array<{ text?: string }>)
        .map((part) => part.text ?? '')
        .join('');
    }

    if ('text' in record) {
      return record.text;
    }

    if ('result' in record) {
      return record.result ?? null;
    }

    if ('hyperlink' in record) {
      return record.text ?? record.hyperlink;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return JSON.stringify(value);
  }

  private async statSafe(absolutePath: string): Promise<{ size: number }> {
    const { stat } = await import('fs/promises');
    return stat(absolutePath);
  }

  async copyUploadToStorage(
    sourcePath: string,
    targetName: string,
  ): Promise<string> {
    await this.ensureDirs();
    const target = path.join(this.storageDir, targetName);
    await pipeline(
      (await import('fs')).createReadStream(sourcePath),
      createWriteStream(target),
    );

    return target;
  }
}
