import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

/**
 * Logs every HTTP request with method, path, status, duration, and a
 * correlation id. The correlation id is attached to `req.correlationId` so
 * downstream services (and the global exception filter) can include it in
 * their own log lines — making it trivial to trace a single request end-to-end
 * across services in production logs.
 *
 * Log shape (one line per request):
 *   [HTTP] POST /api/queue/reception/join 201 42ms cid=a1b2c3d4 user=u-123
 *
 * 5xx responses are logged at ERROR level so they stand out in journalctl /
 * docker logs. Everything else is INFO.
 *
 * NOTE: WebSocket and `@nestjs/throttler` SHORT_CIRCUIT requests pass through
 * this interceptor too — we filter on `host.getType() === 'http'` to skip
 * non-HTTP contexts.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      url: string;
      correlationId?: string;
      user?: { id?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();
    const res = http.getResponse<{ statusCode: number }>();

    // Prefer client-provided correlation id if it looks safe, else generate.
    const incoming = req.headers['x-correlation-id'];
    const cid =
      typeof incoming === 'string' && /^[a-zA-Z0-9-]{6,64}$/.test(incoming)
        ? incoming
        : randomUUID().slice(0, 8);
    req.correlationId = cid;

    const start = Date.now();
    const { method, url } = req;

    return next.handle().pipe(
      tap({
        next: () => this.write(method, url, res.statusCode, start, cid, req.user?.id),
        error: (err: { status?: number }) =>
          this.write(method, url, err?.status ?? 500, start, cid, req.user?.id, true),
      }),
    );
  }

  private write(
    method: string,
    url: string,
    status: number,
    start: number,
    cid: string,
    userId: string | undefined,
    errored = false,
  ) {
    const ms = Date.now() - start;
    const line = `${method} ${url} ${status} ${ms}ms cid=${cid}${
      userId ? ` user=${userId}` : ''
    }`;
    if (errored || status >= 500) this.logger.error(line);
    else if (status >= 400) this.logger.warn(line);
    else this.logger.log(line);
  }
}
