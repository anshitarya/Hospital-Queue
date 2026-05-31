import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Global exception filter.
 *
 * Behaviour:
 *  - Known `HttpException`s pass through with their original status + payload.
 *  - Anything else becomes a 500 with a generic message (so we never leak
 *    stack traces or internal details to clients).
 *  - 5xx responses are logged at ERROR with the correlation id stamped by
 *    `LoggingInterceptor`, so you can grep production logs by `cid=...` to
 *    find every line for the failing request.
 *  - 4xx responses are logged at WARN — useful for tracking rate-limit hits,
 *    auth failures, validation rejections.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{
      method?: string;
      url?: string;
      correlationId?: string;
      user?: { id?: string };
    }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException
        ? (exception.getResponse() as Record<string, unknown>)
        : { message: 'Internal server error' };

    const cid = req?.correlationId ?? '-';
    const userId = req?.user?.id ?? 'anon';
    const summary = `${req?.method ?? '?'} ${req?.url ?? '?'} -> ${status} cid=${cid} user=${userId}`;

    if (status >= 500) {
      this.logger.error(
        summary,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status >= 400) {
      // Avoid leaking PII in 4xx logs — only the route + status are recorded.
      this.logger.warn(summary);
    }

    res.status(status).json({
      statusCode: status,
      path: req?.url,
      correlationId: cid,
      timestamp: new Date().toISOString(),
      ...(typeof body === 'object' ? body : { message: body }),
    });
  }
}
