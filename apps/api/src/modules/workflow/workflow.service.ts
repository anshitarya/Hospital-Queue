import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkflow(clinicId: string) {
    const config = await this.prisma.workflowConfiguration.findUnique({
      where: { clinicId },
    });
    if (!config) {
      return { clinicId, steps: [] };
    }
    return config;
  }

  async setWorkflow(clinicId: string, steps: any[]) {
    return this.prisma.workflowConfiguration.upsert({
      where: { clinicId },
      update: { steps },
      create: { clinicId, steps },
    });
  }
}
