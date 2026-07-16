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
    let steps = config.steps;
    while (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        break;
      }
    }
    return { ...config, steps };
  }

  async setWorkflow(clinicId: string, steps: any[]) {
    return this.prisma.workflowConfiguration.upsert({
      where: { clinicId },
      update: { steps },
      create: { clinicId, steps },
    });
  }
}
