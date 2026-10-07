import { randomUUID } from 'crypto';
import {
  runWithCorrelation,
  type CorrelationStore,
} from './correlation.context';
import { TracingLogger } from './tracing.logger';

type MiddlewareReq = {
  method?: string;
  url?: string;
  path?: string;
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
  requestId?: string;
};

type MiddlewareRes = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  on: (event: string, listener: () => void) => void;
};

type NextFn = (err?: unknown) => void;

/**
 * Express middleware: assigns correlation/request IDs, response headers,
 * and runs the rest of the request inside AsyncLocalStorage so publishers
 * can read `getCorrelationId()` without Request injection.
 */
export function createTracingMiddleware() {
  return (req: MiddlewareReq, res: MiddlewareRes, next: NextFn): void => {
    const incoming =
      headerValue(req.headers['x-correlation-id']) ||
      headerValue(req.headers['x-request-id']) ||
      randomUUID();

    const store: CorrelationStore = {
      correlationId: incoming,
      requestId: randomUUID(),
      instanceId: TracingLogger.getInstanceId(),
      service: TracingLogger.getServiceName(),
    };

    req.correlationId = store.correlationId;
    req.requestId = store.requestId;

    res.setHeader('x-correlation-id', store.correlationId);
    res.setHeader('x-request-id', store.requestId);
    res.setHeader('x-instance-id', store.instanceId);

    const started = Date.now();
    TracingLogger.log('request start', store, {
      method: req.method,
      path: req.path ?? req.url,
    });

    res.on('finish', () => {
      TracingLogger.log('request ok', store, {
        method: req.method,
        path: req.path ?? req.url,
        status: res.statusCode,
        duration: `${Date.now() - started}ms`,
      });
    });

    runWithCorrelation(store, () => next());
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value || undefined;
}
