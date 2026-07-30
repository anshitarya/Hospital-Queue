import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { FinalizePrescriptionDto } from './dto/finalize-prescription.dto';
import { SaveConfigDto } from './dto/save-config.dto';
import { SaveVitalsDto } from './dto/save-vitals.dto';
import { PrescriptionStatus } from '@prisma/client';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('audio-processing') private readonly audioQueue: Queue,
  ) {
    this.bucketName = process.env.S3_BUCKET_NAME ?? 'hospital-prescriptions';
    this.s3Client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? 'mock',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? 'mock',
      },
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
  }

  async uploadAudio(visitId: string, doctorId: string, file: Express.Multer.File) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor || !doctor.prescriptionEnabled) {
      throw new BadRequestException('AI prescription generation is disabled for this professional');
    }

    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { patient: true },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    const key = `audio/${visitId}-${Date.now()}.webm`;
    let audioUrl = '';

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      audioUrl = process.env.S3_PUBLIC_URL
        ? `${process.env.S3_PUBLIC_URL}/${key}`
        : `${process.env.S3_ENDPOINT ?? 'https://s3.amazonaws.com'}/${this.bucketName}/${key}`;
    } catch (err) {
      this.logger.error('Failed to upload audio to S3', err);
      // Fallback url for dev local testing when S3 credentials are unset
      audioUrl = `https://mock-storage.local/${key}`;
    }

    const prescription = await this.prisma.prescription.upsert({
      where: { visitId },
      create: {
        visitId,
        doctorId,
        patientId: visit.patientId,
        locationId: visit.locationId,
        audioUrl,
        status: PrescriptionStatus.PENDING,
      },
      update: {
        audioUrl,
        status: PrescriptionStatus.PENDING,
      },
    });

    // Enqueue transcription job
    await this.audioQueue.add('transcribe', {
      prescriptionId: prescription.id,
      audioUrl,
    });

    return prescription;
  }

  async getPrescriptionForVisit(visitId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { visitId },
      include: {
        medicines: true,
      },
    });
    if (!prescription) {
      throw new NotFoundException('Prescription not found for this visit');
    }
    return prescription;
  }

  async finalizePrescription(doctorId: string, dto: FinalizePrescriptionDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor || !doctor.prescriptionEnabled) {
      throw new BadRequestException('AI prescription generation is disabled for this professional');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { visitId: dto.visitId },
    });
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    // Update prescription text fields and vitals
    const updatedPrescription = await this.prisma.$transaction(async (tx) => {
      // Delete old medicines
      await tx.prescriptionMedicine.deleteMany({
        where: { prescriptionId: prescription.id },
      });

      // Update prescription metadata
      return tx.prescription.update({
        where: { id: prescription.id },
        data: {
          diagnosis: dto.diagnosis,
          symptoms: dto.symptoms,
          generalAdvice: dto.advice,
          allergies: dto.allergies,
          clinicalNotes: dto.clinicalNotes,
          investigationsOrdered: dto.investigationsOrdered,
          referral: dto.referral,
          followUpNote: dto.followUpNote,
          followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
          weight: dto.weight,
          height: dto.height,
          bloodPressure: dto.bloodPressure,
          temperature: dto.temperature,
          pulse: dto.pulse,
          spo2: dto.spo2,
          status: PrescriptionStatus.GENERATING_PDF,
          medicines: {
            create: dto.medicines?.map((m) => ({
              medicine: m.medicine,
              genericName: m.genericName,
              form: m.form,
              dosage: m.dosage,
              frequency: m.frequency,
              frequencyPattern: m.frequencyPattern,
              timing: m.timing,
              duration: m.duration,
              totalQuantity: m.totalQuantity,
              notes: m.notes,
            })),
          },
        },
        include: {
          medicines: true,
        },
      });
    });

    // Enqueue PDF generation job
    await this.audioQueue.add('generate-pdf', {
      prescriptionId: prescription.id,
    });

    return updatedPrescription;
  }

  async getDoctorConfig(doctorId: string) {
    let config = await this.prisma.doctorPrescriptionConfig.findUnique({
      where: { doctorId },
    });
    if (!config) {
      config = await this.prisma.doctorPrescriptionConfig.create({
        data: { doctorId },
      });
    }
    return config;
  }

  async saveDoctorConfig(doctorId: string, dto: SaveConfigDto) {
    return this.prisma.doctorPrescriptionConfig.upsert({
      where: { doctorId },
      create: {
        doctorId,
        ...dto,
      },
      update: {
        ...dto,
      },
    });
  }

  async saveVitals(dto: SaveVitalsDto) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: dto.visitId },
      include: { entries: true },
    });
    if (!visit) {
      throw new NotFoundException('Visit record not found');
    }

    const doctorId = visit.entries?.[0]?.doctorId;
    if (!doctorId) {
      throw new BadRequestException('No doctor associated with this visit');
    }

    return this.prisma.prescription.upsert({
      where: { visitId: dto.visitId },
      create: {
        visitId: dto.visitId,
        doctorId,
        patientId: visit.patientId,
        locationId: visit.locationId,
        weight: dto.weight,
        height: dto.height,
        bloodPressure: dto.bloodPressure,
        temperature: dto.temperature,
        pulse: dto.pulse,
        spo2: dto.spo2,
        status: PrescriptionStatus.PENDING,
      },
      update: {
        weight: dto.weight,
        height: dto.height,
        bloodPressure: dto.bloodPressure,
        temperature: dto.temperature,
        pulse: dto.pulse,
        spo2: dto.spo2,
      },
    });
  }
}
