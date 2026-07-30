import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from './prisma.service';
import { PrescriptionStatus } from '@prisma/client';

@Processor('audio-processing')
@Injectable()
export class AudioProcessor extends WorkerHost {
  private readonly logger = new Logger(AudioProcessor.name);
  private openai: OpenAI;
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private readonly prisma: PrismaService) {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? 'mock-key',
    });
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

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Starting job ${job.name} (id: ${job.id})`);
    try {
      switch (job.name) {
        case 'transcribe':
          await this.handleTranscription(job.data.prescriptionId, job.data.audioUrl);
          break;
        case 'generate-pdf':
          await this.handlePdfGeneration(job.data.prescriptionId);
          break;
        default:
          this.logger.warn(`Unhandled job type: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(`Failed to process job ${job.name}`, err);
      throw err;
    }
  }

  private async handleTranscription(prescriptionId: string, audioUrl: string) {
    // 1. Fetch prescription
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });
    if (!prescription) {
      this.logger.error(`Prescription ${prescriptionId} not found in DB`);
      return;
    }

    // Update status to transcribing
    await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: { status: PrescriptionStatus.TRANSCRIBING },
    });

    // 2. Perform speech-to-text via OpenAI Whisper
    let rawTranscript = '';
    if (process.env.OPENAI_API_KEY === 'mock-key' || !process.env.OPENAI_API_KEY) {
      this.logger.warn('Mocking Whisper speech-to-text transcription (OPENAI_API_KEY not configured)');
      rawTranscript = 'Patient presents with mild fever and wet cough for the past three days. Checked vitals. Weight is seventy two kilograms, blood pressure is one hundred twenty over eighty. Diagnosing Upper Respiratory Tract Infection. Prescribing Azithromycin five hundred milligrams once daily for three days after meals, and Paracetamol six hundred fifty milligrams SOS for fever. Advice rest and plenty of fluids.';
    } else {
      try {
        // Download audio file from storage
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`Failed to download audio from ${audioUrl}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const file = await OpenAI.toFile(buffer, 'audio.webm', { type: 'audio/webm' });
        
        const response = await this.openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
        });
        rawTranscript = response.text;
      } catch (err) {
        this.logger.error('OpenAI Whisper transcription failed', err);
        await this.prisma.prescription.update({
          where: { id: prescriptionId },
          data: { status: PrescriptionStatus.FAILED },
        });
        throw err;
      }
    }

    // 3. Structure raw text using GPT-4o-mini
    let structuredJson: any = null;
    if (process.env.OPENAI_API_KEY === 'mock-key' || !process.env.OPENAI_API_KEY) {
      structuredJson = {
        symptoms: 'Mild fever, wet cough for 3 days',
        diagnosis: 'Upper Respiratory Tract Infection (URTI)',
        advice: 'Rest and drink plenty of fluids.',
        weight: '72 kg',
        bloodPressure: '120/80 mmHg',
        medicines: [
          {
            medicine: 'Azithromycin 500',
            genericName: 'Azithromycin',
            form: 'Tablet',
            dosage: '500 mg',
            frequency: 'Once Daily',
            frequencyPattern: '1-0-0',
            timing: 'After food',
            duration: '3 Days',
            notes: 'Take in the morning',
          },
          {
            medicine: 'Paracetamol 650',
            genericName: 'Paracetamol',
            form: 'Tablet',
            dosage: '650 mg',
            frequency: 'SOS',
            frequencyPattern: '0-0-0',
            timing: 'After food',
            duration: 'As needed',
            notes: 'Take for fever',
          }
        ]
      };
    } else {
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert medical scribe. Analyze the doctor's audio transcript of a patient consultation and structure it into a clean, valid JSON object containing:
- symptoms: chief complaints reported (comma separated)
- diagnosis: diagnosed condition (e.g., "Acute Bronchitis")
- advice: non-pharmacological instructions
- weight: patient weight if mentioned (e.g. "72 kg")
- bloodPressure: BP if mentioned (e.g. "120/80 mmHg")
- medicines: array of objects containing:
  - medicine: brand name or name of drug (e.g., "Azithromycin 500")
  - genericName: chemical name (e.g. "Azithromycin")
  - form: "Tablet" | "Syrup" | "Capsule" | "Ointment" | "Drops" | "Inhaler" | "Injection"
  - dosage: strength/quantity (e.g., "500 mg")
  - frequency: e.g., "Once Daily", "Twice Daily", "SOS"
  - frequencyPattern: e.g., "1-0-0", "1-0-1"
  - timing: e.g., "After food", "Before food"
  - duration: e.g., "3 Days", "1 Week"
  - notes: specific warnings or instructions

Output must be strictly JSON matching the schema, with no markdown wrappers or additional text.`
            },
            {
              role: 'user',
              content: rawTranscript
            }
          ],
          response_format: { type: 'json_object' }
        });
        structuredJson = JSON.parse(completion.choices[0].message.content ?? '{}');
      } catch (err) {
        this.logger.error('OpenAI GPT structuring failed', err);
        await this.prisma.prescription.update({
          where: { id: prescriptionId },
          data: { status: PrescriptionStatus.FAILED },
        });
        throw err;
      }
    }

    // 4. Update prescription record with results and move to READY_FOR_REVIEW
    await this.prisma.$transaction(async (tx: any) => {
      // Save parsed medicines
      if (structuredJson.medicines && Array.isArray(structuredJson.medicines)) {
        await tx.prescriptionMedicine.deleteMany({ where: { prescriptionId } });
        await tx.prescriptionMedicine.createMany({
          data: structuredJson.medicines.map((m: any) => ({
            prescriptionId,
            medicine: m.medicine || '',
            genericName: m.genericName || null,
            form: m.form || null,
            dosage: m.dosage || '',
            frequency: m.frequency || '',
            frequencyPattern: m.frequencyPattern || null,
            timing: m.timing || null,
            duration: m.duration || '',
            notes: m.notes || null,
          })),
        });
      }

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          rawTranscript,
          structuredJson: structuredJson as any,
          symptoms: structuredJson.symptoms || null,
          diagnosis: structuredJson.diagnosis || null,
          generalAdvice: structuredJson.advice || null,
          weight: structuredJson.weight || null,
          bloodPressure: structuredJson.bloodPressure || null,
          status: PrescriptionStatus.READY_FOR_REVIEW,
        },
      });
    });

    this.logger.log(`Prescription ${prescriptionId} successfully transcribed and structured.`);
  }

  private async handlePdfGeneration(prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        medicines: true,
        doctor: {
          include: {
            user: true,
            clinic: true,
          }
        },
        visit: {
          include: {
            patient: true,
            location: true,
          }
        }
      }
    });

    if (!prescription) {
      this.logger.error(`Prescription ${prescriptionId} not found for PDF generation`);
      return;
    }

    // Fetch config
    let config = await this.prisma.doctorPrescriptionConfig.findUnique({
      where: { doctorId: prescription.doctorId },
    });
    if (!config) {
      config = await this.prisma.doctorPrescriptionConfig.create({
        data: { doctorId: prescription.doctorId },
      });
    }

    // Compile PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    // Logo & Header
    if (config.headerEnabled) {
      if (config.showLogo && prescription.doctor.clinic?.logoUrl) {
        try {
          const res = await fetch(prescription.doctor.clinic.logoUrl);
          const logoBuffer = Buffer.from(await res.arrayBuffer());
          doc.image(logoBuffer, 50, 45, { width: 50 });
        } catch {
          // ignore failed logo fetch
        }
      }
      doc.fontSize(18).text(prescription.doctor.clinic?.name ?? 'Clinic', 110, 45, { align: 'right' });
      if (config.customHeaderText) {
        doc.fontSize(9).text(config.customHeaderText, 110, 65, { align: 'right' });
      }
      doc.fontSize(9).text(prescription.visit.location.address, 110, 80, { align: 'right' });
      doc.moveDown(2);
    } else {
      doc.moveDown(5); // Padding for physical letterhead
    }

    // Divider line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Doctor info
    doc.fontSize(11).text(`Dr. ${prescription.doctor.user.name}`, { underline: true });
    doc.fontSize(9).text(`Department: ${prescription.doctor.specialization ?? 'General Physician'}`);
    doc.fontSize(9).text(`Experience: ${prescription.doctor.experience ?? 0} Years`);
    doc.moveDown(1.5);

    // Patient info block
    const patientY = doc.y;
    doc.rect(50, patientY, 495, 50).stroke();
    doc.fontSize(9).text(`Patient Name: ${prescription.visit.patient.name}`, 60, patientY + 10);
    
    if (config.showPatientAge) {
      doc.text(`Age/Gender: N/A`, 60, patientY + 22);
    }
    if (config.showPatientMobile && prescription.visit.patient.phone) {
      doc.text(`Mobile: ${prescription.visit.patient.phone}`, 60, patientY + 34);
    }
    if (config.showDate) {
      doc.text(`Date: ${prescription.createdAt.toLocaleDateString()}`, 380, patientY + 10);
    }
    doc.moveDown(4);

    // Render Configurable Sections
    for (const section of config.sectionOrder) {
      if (section === 'vitals' && config.showVitals) {
        const vitals: string[] = [];
        if (prescription.weight) vitals.push(`Weight: ${prescription.weight}`);
        if (prescription.height) vitals.push(`Height: ${prescription.height}`);
        if (prescription.bloodPressure) vitals.push(`BP: ${prescription.bloodPressure}`);
        if (prescription.temperature) vitals.push(`Temp: ${prescription.temperature}`);
        if (prescription.pulse) vitals.push(`Pulse: ${prescription.pulse}`);
        if (prescription.spo2) vitals.push(`SpO2: ${prescription.spo2}`);
        
        if (vitals.length > 0) {
          doc.fontSize(11).text('Vitals', { underline: true });
          doc.fontSize(9).text(vitals.join(' | '));
          doc.moveDown(1.5);
        }
      }

      if (section === 'symptoms' && config.showSymptoms && prescription.symptoms) {
        doc.fontSize(11).text('Symptoms / Chief Complaints', { underline: true });
        doc.fontSize(9).text(prescription.symptoms);
        doc.moveDown(1.5);
      }

      if (section === 'diagnosis' && config.showDiagnosis && prescription.diagnosis) {
        doc.fontSize(11).text('Diagnosis', { underline: true });
        doc.fontSize(9).text(prescription.diagnosis);
        doc.moveDown(1.5);
      }

      if (section === 'medicines' && prescription.medicines.length > 0) {
        doc.fontSize(11).text('Rx (Medicines)', { underline: true });
        prescription.medicines.forEach((med, idx) => {
          let medText = `${idx + 1}. ${med.medicine} (${med.dosage}) - ${med.frequency} - ${med.duration}`;
          if (med.timing) medText += ` [${med.timing}]`;
          doc.fontSize(9).text(medText);
          if (med.notes) {
            doc.fontSize(8.5).fillColor('#666666').text(`   Instructions: ${med.notes}`).fillColor('#000000');
          }
        });
        doc.moveDown(1.5);
      }

      if (section === 'advice' && config.showAdvice && prescription.advice) {
        doc.fontSize(11).text('Advice / Special Instructions', { underline: true });
        doc.fontSize(9).text(prescription.advice);
        doc.moveDown(1.5);
      }

      if (section === 'investigations' && config.showInvestigations && prescription.investigationsOrdered) {
        doc.fontSize(11).text('Investigations Ordered', { underline: true });
        doc.fontSize(9).text(prescription.investigationsOrdered);
        doc.moveDown(1.5);
      }
    }

    // Signature
    if (config.showSignature) {
      doc.moveDown(2);
      if (config.signatureUrl) {
        try {
          const res = await fetch(config.signatureUrl);
          const sigBuffer = Buffer.from(await res.arrayBuffer());
          doc.image(sigBuffer, 380, doc.y, { width: 80 });
        } catch {
          doc.fontSize(9).text('Digitally Signed', 380, doc.y + 10, { align: 'right' });
        }
      } else {
        doc.fontSize(9).text('Dr. Signature', 380, doc.y + 10, { align: 'right' });
      }
    }

    // Footer
    if (config.footerEnabled && config.customFooterText) {
      doc.fontSize(8).fillColor('#777777').text(config.customFooterText, 50, 780, { align: 'center', width: 495 });
    }

    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const key = `prescriptions/${prescriptionId}.pdf`;
    let pdfUrl = '';

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        }),
      );
      pdfUrl = process.env.S3_PUBLIC_URL
        ? `${process.env.S3_PUBLIC_URL}/${key}`
        : `${process.env.S3_ENDPOINT ?? 'https://s3.amazonaws.com'}/${this.bucketName}/${key}`;
    } catch (err) {
      this.logger.error('Failed to upload generated PDF to S3', err);
      try {
        const publicDir = path.resolve(process.cwd(), '../web/public/prescriptions');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, `${prescriptionId}.pdf`), pdfBuffer);
        pdfUrl = `http://localhost:3000/prescriptions/${prescriptionId}.pdf`;
        this.logger.log(`Successfully saved PDF locally for dev fallback: ${pdfUrl}`);
      } catch (writeErr) {
        this.logger.error('Failed to write PDF locally', writeErr);
        pdfUrl = `https://mock-storage.local/${key}`;
      }
    }

    // Update prescription status to COMPLETED
    await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        pdfUrl,
        status: PrescriptionStatus.COMPLETED,
      },
    });

    // Enqueue sending WhatsApp notification job to the notifications queue
    if (prescription.visit.patient.phone) {
      this.logger.log(`Enqueuing whatsapp delivery job for ${prescription.visit.patient.phone}`);
      // Push job into the `notifications` queue that notification-service listens to
      // We will define a new queue client or inject the queue.
      // Since BullMQ in NestJS requires registering queue, let's create a connection to the 'notifications' queue.
      // In NestJS, we can instantiate a BullMQ Queue instance directly.
      const notificationsQueue = new Queue('notifications', {
        connection: {
          url: (process.env.REDIS_URL ?? 'redis://localhost:6379').trim(),
        }
      });
      await notificationsQueue.add('send-whatsapp', {
        patientPhone: prescription.visit.patient.phone,
        patientName: prescription.visit.patient.name,
        doctorName: prescription.doctor.user.name,
        pdfUrl,
      });
      await notificationsQueue.close();
    }
  }
}
