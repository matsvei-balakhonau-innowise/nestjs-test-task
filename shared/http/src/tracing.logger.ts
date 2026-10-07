import { Logger } from '@nestjs/common';
import type { CorrelationStore } from './correlation.context';

export class TracingLogger {
  private static readonly logger = new Logger('Tracing');
  private static instanceId = 'unknown';
  private static serviceName = 'app';

  static configure(service: string, instanceId: string): void {
    TracingLogger.serviceName = service;
    TracingLogger.instanceId = instanceId;
    TracingLogger.logger.log(
      `[service=${service}] [replica=${instanceId}] tracing ready`,
    );
  }

  static getInstanceId(): string {
    return TracingLogger.instanceId;
  }

  static getServiceName(): string {
    return TracingLogger.serviceName;
  }

  static log(
    message: string,
    context?: Partial<CorrelationStore>,
    metadata?: Record<string, unknown>,
  ): void {
    TracingLogger.logger.log(TracingLogger.format(message, context, metadata));
  }

  static error(
    message: string,
    context?: Partial<CorrelationStore>,
    metadata?: Record<string, unknown>,
  ): void {
    TracingLogger.logger.error(
      TracingLogger.format(message, context, metadata),
    );
  }

  private static format(
    message: string,
    context?: Partial<CorrelationStore>,
    metadata?: Record<string, unknown>,
  ): string {
    const parts = [
      `[service=${context?.service ?? TracingLogger.serviceName}]`,
      `[replica=${context?.instanceId ?? TracingLogger.instanceId}]`,
    ];

    if (context?.correlationId) {
      parts.push(`[correlationId=${context.correlationId}]`);
    }
    if (context?.requestId) {
      parts.push(`[requestId=${context.requestId}]`);
    }
    if (metadata?.method != null) {
      parts.push(`[method=${String(metadata.method)}]`);
    }
    if (metadata?.path != null) {
      parts.push(`[path=${String(metadata.path)}]`);
    }
    if (metadata?.status != null) {
      parts.push(`[status=${String(metadata.status)}]`);
    }
    if (metadata?.duration != null) {
      parts.push(`[duration=${String(metadata.duration)}]`);
    }

    return `${parts.join(' ')} ${message}`;
  }
}
