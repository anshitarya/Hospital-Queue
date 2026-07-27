import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    rawBody: true,
  });

  app.use(helmet());
  app.use(cookieParser());

  // Artificial latency middleware for testing skeleton shimmer loaders
  app.use((req: any, res: any, next: () => void) => {
    const delay = Number(process.env.DEV_THROTTLE_MS ?? 0);
    // Keep initial page bootstrap /auth/me check instant so first load is instant
    const isInitialAuthCheck = req.method === 'GET' && (req.path === '/api/auth/me' || req.path === '/auth/me');
    if (delay > 0 && !isInitialAuthCheck) {
      setTimeout(next, delay);
    } else {
      next();
    }
  });

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Hospital Queue API listening on :${port}`, 'Bootstrap');
}

bootstrap();
