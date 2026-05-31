import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  list(departmentId?: string) {
    return this.prisma.doctor.findMany({
      where: departmentId ? { departmentId } : undefined,
      include: { user: true, department: true },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async get(id: string) {
    const doc = await this.prisma.doctor.findUnique({
      where: { id },
      include: { user: true, department: true },
    });
    if (!doc) throw new NotFoundException(`Doctor ${id} not found`);
    return doc;
  }

  async update(id: string, dto: UpdateDoctorDto) {
    await this.get(id);
    return this.prisma.doctor.update({
      where: { id },
      data: dto,
      include: { user: true, department: true },
    });
  }
}
