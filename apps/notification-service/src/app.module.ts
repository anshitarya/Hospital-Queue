import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WhatsappService } from './whatsapp.service';
import { NotificationProcessor } from './notification.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: (process.env.REDIS_URL ?? 'redis://localhost:6379').trim(),
      },
    }),
  ],
  providers: [WhatsappService, NotificationProcessor],
})
export class AppModule {}
