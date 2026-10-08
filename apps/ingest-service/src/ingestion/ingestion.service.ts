import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import { lookup } from 'dns/promises';
import { createWriteStream } from 'fs';
import { access, mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { isIP } from 'net';
import { pipeline } from 'stream/promises';
import ExcelJS from 'exceljs';
import { ExportFormat } from './dto/pull-dataset.dto';

const FETCH_TIMEOUT_MS = 60_000;
const MAX_FETCH_BYTES = Number(process.env.PULL_MAX_BYTES || 10 * 1024 * 1024);
const DEFAULT_ALLOWED_HOSTS = [
  'jsonplaceholder.typicode.com',
  'dummyjson.com',
];

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
    if (ext === '.xlsx') {
      return this.parseExcelFile(absolutePath);
    }

    throw new BadRequestException(
      `Unsupported file type "${ext}". Use .json or .xlsx`,
    );
  }

  private async fetchJson(url: string): Promise<unknown> {
    const safeUrl = await this.assertSafePullUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(safeUrl.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        redirect: 'error',
      });

      if (!response.ok) {
        throw new BadRequestException(
          `Upstream responded ${response.status} for ${url}`,
        );
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_FETCH_BYTES) {
        throw new BadRequestException(
          `Upstream Content-Length ${contentLength} exceeds limit of ${MAX_FETCH_BYTES} bytes`,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      const text = await this.readBodyLimited(response, MAX_FETCH_BYTES);

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

  private allowedPullHosts(): string[] {
    const raw = process.env.PULL_ALLOWED_HOSTS;
    if (raw === undefined || raw.trim() === '') {
      return DEFAULT_ALLOWED_HOSTS;
    }

    return raw
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  private async assertSafePullUrl(urlString: string): Promise<URL> {
    let url: URL;

    try {
      url = new URL(urlString);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Only http(s) URLs are allowed');
    }

    if (url.username || url.password) {
      throw new BadRequestException('URLs with credentials are not allowed');
    }

    const hostname = url.hostname.toLowerCase();
    if (!hostname) {
      throw new BadRequestException('URL hostname is required');
    }

    const allowed = this.allowedPullHosts();
    if (!allowed.includes('*') && !allowed.includes(hostname)) {
      throw new BadRequestException(
        `Host "${hostname}" is not in the pull allow-list`,
      );
    }

    if (this.isBlockedHostname(hostname)) {
      throw new BadRequestException('URL targets a blocked address');
    }

    if (isIP(hostname)) {
      if (this.isBlockedIp(hostname)) {
        throw new BadRequestException('URL targets a blocked address');
      }
      return url;
    }

    let address: string;
    try {
      ({ address } = await lookup(hostname, { all: false }));
    } catch {
      throw new BadRequestException(`Could not resolve host "${hostname}"`);
    }

    if (this.isBlockedIp(address)) {
      throw new BadRequestException('URL resolves to a blocked address');
    }

    return url;
  }

  private isBlockedHostname(hostname: string): boolean {
    return (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === 'metadata.google.internal'
    );
  }

  private isBlockedIp(ip: string): boolean {
    const version = isIP(ip);
    if (version === 4) {
      const parts = ip.split('.').map(Number);
      const [a, b] = parts;

      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        a >= 224
      );
    }

    if (version === 6) {
      const normalized = ip.toLowerCase();
      const v4Mapped = normalized.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/);
      if (v4Mapped) {
        return this.isBlockedIp(v4Mapped[1]);
      }

      return (
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb') ||
        normalized.startsWith('ff')
      );
    }

    return true;
  }

  private async readBodyLimited(
    response: Response,
    maxBytes: number,
  ): Promise<string> {
    if (!response.body) {
      throw new BadRequestException('Upstream returned an empty body');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BadRequestException(
          `Upstream body exceeds limit of ${maxBytes} bytes`,
        );
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
      'utf8',
    );
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
    try {
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
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Could not parse Excel file: ${message}`);
    }
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
