import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultLocationForUser(userId: string): Promise<string> {
    const userLoc = await this.prisma.userLocation.findFirst({
      where: { userId },
      select: { locationId: true }
    });
    if (userLoc) return userLoc.locationId;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clinicId: true }
    });
    if (user?.clinicId) {
      const firstLoc = await this.prisma.location.findFirst({
        where: { clinicId: user.clinicId },
        select: { id: true }
      });
      if (firstLoc) return firstLoc.id;
    }
    throw new Error('User is not assigned to any location');
  }

  async getWorkflow(locationId: string) {
    const config = await this.prisma.workflowConfiguration.findUnique({
      where: { locationId },
    });
    if (!config) {
      return { locationId, steps: [] };
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

  async setWorkflow(locationId: string, steps: any[]) {
    return this.prisma.workflowConfiguration.upsert({
      where: { locationId },
      update: { steps },
      create: { locationId, steps },
    });
  }
}
