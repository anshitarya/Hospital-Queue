import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Processor('notifications')
@Injectable()
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly whatsapp: WhatsappService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing notification job ${job.name} (id: ${job.id})`);
    switch (job.name) {
      case 'send-whatsapp':
        const { patientPhone, patientName, doctorName, pdfUrl } = job.data;
        await this.whatsapp.sendPrescription(patientPhone, patientName, doctorName, pdfUrl);
        break;
      default:
        this.logger.warn(`Unknown notification job: ${job.name}`);
    }
  }
}
