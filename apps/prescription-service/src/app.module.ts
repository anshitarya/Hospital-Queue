import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaService } from './prisma.service';
import { AudioProcessor } from './audio.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: (process.env.REDIS_URL ?? 'redis://localhost:6379').trim(),
      },
    }),
    BullModule.registerQueue({
      name: 'audio-processing',
    }),
  ],
  providers: [PrismaService, AudioProcessor],
})
export class AppModule {}
