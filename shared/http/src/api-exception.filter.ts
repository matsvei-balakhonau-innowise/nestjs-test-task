import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { getCorrelationId } from './correlation.context';
import type { ApiErrorResponse } from './error-response';

type HttpReq = { url?: string; correlationId?: string };
type HttpRes = {
  status: (code: number) => { json: (body: unknown) => void };
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpRes>();
    const request = ctx.getRequest<HttpReq>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Unexpected error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = HttpStatus[statusCode] ?? error;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? message;
        error = String(obj.error ?? HttpStatus[statusCode] ?? error);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`Non-error throw: ${String(exception)}`);
    }

    const correlationId =
      request.correlationId ?? getCorrelationId() ?? undefined;

    const payload: ApiErrorResponse = {
      statusCode,
      error,
      message,
      path: request.url ?? '',
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    };

    response.status(statusCode).json(payload);
  }
}
