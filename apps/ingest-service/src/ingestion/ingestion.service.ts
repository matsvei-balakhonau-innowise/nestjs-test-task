import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'dns/promises';
import { access, mkdir, readFile, stat, writeFile } from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { isIP } from 'net';
import type { IncomingMessage } from 'http';
import { errorMessage } from '@shared/http';
import ExcelJS from 'exceljs';
import type { IngestEnv } from '../config/env.validation';
import { ExportFormat } from './dto/pull-dataset.dto';

const FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_ALLOWED_HOSTS = [
  'jsonplaceholder.typicode.com',
  'dummyjson.com',
];

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly storageDir = path.join(process.cwd(), 'storage');
  private readonly uploadsDir = path.join(process.cwd(), 'uploads');
  private readonly maxFetchBytes: number;
  private readonly pullAllowedHosts?: string;

  constructor(config: ConfigService<IngestEnv, true>) {
    this.maxFetchBytes = config.get('PULL_MAX_BYTES', { infer: true });
    this.pullAllowedHosts = config.get('PULL_ALLOWED_HOSTS', { infer: true });
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.storageDir, { recursive: true });
    await mkdir(this.uploadsDir, { recursive: true });
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
      const { size } = await stat(absolutePath);

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
    const target = await this.resolveSafePullTarget(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await this.pinnedHttpGet(target, controller.signal);

      if (response.statusCode && response.statusCode >= 400) {
        throw new BadRequestException(
          `Upstream responded ${response.statusCode} for ${url}`,
        );
      }

      const contentLength = response.headers['content-length'];
      const lengthHeader = Array.isArray(contentLength)
        ? contentLength[0]
        : contentLength;
      if (lengthHeader && Number(lengthHeader) > this.maxFetchBytes) {
        throw new BadRequestException(
          `Upstream Content-Length ${lengthHeader} exceeds limit of ${this.maxFetchBytes} bytes`,
        );
      }

      const contentTypeRaw = response.headers['content-type'];
      const contentType = Array.isArray(contentTypeRaw)
        ? contentTypeRaw[0]
        : contentTypeRaw;
      const text = await this.readBodyLimitedFromStream(
        response,
        this.maxFetchBytes,
        controller.signal,
      );

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
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message === 'Aborted')
      ) {
        throw new RequestTimeoutException(
          `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s for ${url}`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to fetch ${url}: ${errorMessage(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private allowedPullHosts(): string[] {
    const raw = this.pullAllowedHosts;
    if (raw === undefined || raw.trim() === '') {
      return DEFAULT_ALLOWED_HOSTS;
    }

    return raw
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  private async resolveSafePullTarget(urlString: string): Promise<{
    url: URL;
    hostname: string;
    pinnedAddress: string;
  }> {
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

      return { url, hostname, pinnedAddress: hostname };
    }

    let records: Array<{ address: string }>;
    try {
      records = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException(`Could not resolve host "${hostname}"`);
    }

    if (records.length === 0) {
      throw new BadRequestException(`Could not resolve host "${hostname}"`);
    }

    for (const { address } of records) {
      if (this.isBlockedIp(address)) {
        throw new BadRequestException('URL resolves to a blocked address');
      }
    }

    return { url, hostname, pinnedAddress: records[0].address };
  }

  private pinnedHttpGet(
    target: { url: URL; hostname: string; pinnedAddress: string },
    signal: AbortSignal,
  ): Promise<IncomingMessage> {
    const { url, hostname, pinnedAddress } = target;
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const port = url.port
      ? Number(url.port)
      : isHttps
        ? 443
        : 80;
    const pathWithQuery = `${url.pathname}${url.search}`;
    const family = isIP(pinnedAddress) === 6 ? 6 : 4;

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          host: pinnedAddress,
          port,
          path: pathWithQuery,
          method: 'GET',
          headers: {
            Host: hostname,
            Accept: 'application/json',
          },
          servername: isHttps ? hostname : undefined,
          lookup: (_host, _opts, cb) => cb(null, pinnedAddress, family),
        },
        (res) => resolve(res),
      );

      const onAbort = (): void => {
        req.destroy(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });

      req.on('error', (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });

      req.end();
    });
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
    const mapped = this.extractIpv4FromMapped(ip);
    if (mapped) {
      return this.isBlockedIp(mapped);
    }

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

  private extractIpv4FromMapped(ip: string): string | null {
    const normalized = ip.toLowerCase();
    const dotted = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
      return dotted[1];
    }

    const hexTail = normalized.match(
      /(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (!hexTail) {
      return null;
    }

    const hi = parseInt(hexTail[1], 16);
    const lo = parseInt(hexTail[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  private async readBodyLimitedFromStream(
    response: IncomingMessage,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<string> {
    const chunks: Buffer[] = [];
    let total = 0;

    return await new Promise((resolve, reject) => {
      const fail = (error: Error): void => {
        response.destroy();
        reject(error);
      };

      const onAbort = (): void => {
        fail(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });

      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          signal.removeEventListener('abort', onAbort);
          response.destroy();
          reject(
            new BadRequestException(
              `Upstream body exceeds limit of ${maxBytes} bytes`,
            ),
          );
          return;
        }

        chunks.push(chunk);
      });

      response.on('end', () => {
        signal.removeEventListener('abort', onAbort);
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      response.on('error', (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });
    });
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
    const raw = await readFile(absolutePath, 'utf8');

    if (!raw.trim()) {
      throw new BadRequestException('Uploaded JSON file is empty');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error: unknown) {
      throw new BadRequestException(`Invalid JSON: ${errorMessage(error)}`);
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

      throw new BadRequestException(
        `Could not parse Excel file: ${errorMessage(error)}`,
      );
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
}
