import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as path from 'path';
import { ActivityPublisher } from '../activity/activity.publisher';
import { CatalogService } from '../catalog/catalog.service';
import { ExportFormat, PullDatasetDto } from './dto/pull-dataset.dto';
import { IngestionService } from './ingestion.service';

@ApiTags('ingestion')
@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly catalog: CatalogService,
    private readonly activity: ActivityPublisher,
  ) {}

  @Post('pull')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch JSON from a public API and save as JSON or Excel (in code)',
  })
  @ApiBody({
    type: PullDatasetDto,
    examples: {
      photosJson: {
        summary: 'Pull JSONPlaceholder photos as JSON',
        value: {
          url: 'https://jsonplaceholder.typicode.com/photos',
          format: 'json',
          filename: 'photos',
        },
      },
      productsExcel: {
        summary: 'Pull DummyJSON products as Excel',
        value: {
          url: 'https://dummyjson.com/products?limit=100',
          format: 'excel',
          filename: 'products',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Dataset written to disk',
    schema: {
      example: {
        message: 'Dataset pulled and written to disk',
        absolutePath: '/app/apps/ingest-service/storage/photos.json',
        relativePath: 'storage/photos.json',
        format: 'json',
        recordCount: 5000,
        bytesWritten: 1039898,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid URL, empty payload, or bad filename',
    schema: {
      example: {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Remote API returned no records',
        path: '/v1/ingestion/pull',
        timestamp: '2026-10-05T10:00:00.000Z',
      },
    },
  })
  async pull(@Body() body: PullDatasetDto) {
    const result = await this.ingestion.pullAndPersist({
      url: body.url,
      format: body.format ?? ExportFormat.JSON,
      filename: body.filename,
    });

    await this.activity.emit('ingestion.pull', {
      url: body.url,
      format: result.format,
      recordCount: result.recordCount,
      path: result.relativePath,
    });

    return {
      message: 'Dataset pulled and written to disk',
      ...result,
    };
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload JSON/Excel, parse in code, bulk-insert into MongoDB',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JSON or Excel (.xlsx) file',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, path.join(process.cwd(), 'uploads'));
        },
        filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${Date.now()}_${safe}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();

        if (!['.json', '.xlsx'].includes(ext)) {
          cb(
            new BadRequestException('Only .json and .xlsx uploads are allowed') as never,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async importFile(@UploadedFile() file?: Express.Multer.File) {
    await this.ingestion.ensureDirs();

    if (!file) {
      throw new BadRequestException('Missing multipart file field "file"');
    }

    const rows = await this.ingestion.readRecordsFromFile(file.path);
    const source = file.originalname;
    const { inserted, batches } = await this.catalog.insertManyFromFile(
      rows,
      source,
    );

    await this.activity.emit('ingestion.import', {
      source,
      parsed: rows.length,
      inserted,
      batches,
    });

    return {
      message: 'File parsed and inserted into MongoDB',
      source,
      parsed: rows.length,
      inserted,
      batches,
      storedAt: file.path,
    };
  }
}
