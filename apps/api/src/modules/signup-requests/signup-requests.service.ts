import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SignupRequestStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClinicsService } from '../clinics/clinics.service';
import { CreateSignupRequestDto } from './dto/create-signup-request.dto';
import { UpdateSignupRequestDto } from './dto/update-signup-request.dto';
import { ApproveSignupRequestDto } from './dto/approve-signup-request.dto';

@Injectable()
export class SignupRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinics: ClinicsService,
  ) {}

  async create(dto: CreateSignupRequestDto) {
    const existing = await this.prisma.businessSignupRequest.findFirst({
      where: {
        status: SignupRequestStatus.PENDING,
        OR: [{ email: dto.email }, { phone: dto.phone }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException(
        'We already have your request on file. Our team will reach out shortly.',
      );
    }

    return this.prisma.businessSignupRequest.create({
      data: {
        businessName: dto.businessName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
      },
    });
  }

  list(status?: SignupRequestStatus) {
    return this.prisma.businessSignupRequest.findMany({
      where: status ? { status } : undefined,
      include: { clinic: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async get(id: string) {
    const row = await this.prisma.businessSignupRequest.findUnique({
      where: { id },
      include: { clinic: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('Signup request not found');
    return row;
  }

  async update(id: string, dto: UpdateSignupRequestDto) {
    const row = await this.get(id);
    if (row.status === SignupRequestStatus.APPROVED && dto.status && dto.status !== SignupRequestStatus.APPROVED) {
      throw new BadRequestException('Approved requests cannot be moved to another status');
    }

    const terminal: SignupRequestStatus[] = [SignupRequestStatus.APPROVED, SignupRequestStatus.REJECTED];
    const reviewedAt =
      dto.status && terminal.includes(dto.status) ? new Date() : undefined;

    return this.prisma.businessSignupRequest.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(reviewedAt && { reviewedAt }),
      },
      include: { clinic: { select: { id: true, name: true } } },
    });
  }

  async approve(id: string, dto: ApproveSignupRequestDto) {
    const row = await this.get(id);
    if (row.status === SignupRequestStatus.APPROVED) {
      throw new BadRequestException('This request is already approved');
    }
    if (row.clinicId) {
      const clinic = await this.prisma.clinic.findUnique({ where: { id: row.clinicId } });
      if (clinic) {
        return { request: row, clinic };
      }
    }

    const clinic = await this.clinics.create({
      name: row.businessName,
      address: dto.address,
      businessType: dto.businessType,
    });

    const request = await this.prisma.businessSignupRequest.update({
      where: { id },
      data: {
        status: SignupRequestStatus.APPROVED,
        clinicId: clinic.id,
        reviewedAt: new Date(),
      },
      include: { clinic: { select: { id: true, name: true } } },
    });

    return { request, clinic };
  }

  pendingCount() {
    return this.prisma.businessSignupRequest.count({
      where: { status: SignupRequestStatus.PENDING },
    });
  }
}
