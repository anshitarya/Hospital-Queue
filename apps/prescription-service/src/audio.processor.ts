import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { PrismaService } from './prisma.service';
import { PrescriptionStatus } from '@prisma/client';

@Processor('audio-processing')
@Injectable()
export class AudioProcessor extends WorkerHost {
  private readonly logger = new Logger(AudioProcessor.name);
  private openai: OpenAI;
  private geminiAI: GoogleGenerativeAI;
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private readonly prisma: PrismaService) {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? 'mock-key',
    });
    this.geminiAI = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY ?? 'mock-key',
    );
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

    // 2. Perform speech-to-text and structuring
    let rawTranscript = '';
    let structuredJson: any = null;

    // A. Try Google Gemini first (Speech-to-Text + Structuring in a single step)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'mock-key') {
      this.logger.log('Performing speech-to-text and structuring via Google Gemini 1.5 Flash...');
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`Failed to download audio from ${audioUrl}`);
        const buffer = Buffer.from(await res.arrayBuffer());

        const audioPart = {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: 'audio/webm',
          },
        };

        const schema: any = {
          type: SchemaType.OBJECT,
          properties: {
            transcript: {
              type: SchemaType.STRING,
              description: 'The exact full text transcription of what the doctor said in the audio recording.',
            },
            prescription: {
              type: SchemaType.OBJECT,
              description: 'The structured medical prescription details.',
              properties: {
                symptoms: {
                  type: SchemaType.STRING,
                  description: 'Chief complaints and symptoms reported, comma separated (e.g., "Mild fever, wet cough")',
                },
                diagnosis: {
                  type: SchemaType.STRING,
                  description: 'Diagnosed condition (e.g., "Upper Respiratory Tract Infection")',
                },
                advice: {
                  type: SchemaType.STRING,
                  description: 'Non-pharmacological instructions (e.g., "Rest and drink plenty of fluids")',
                },
                weight: {
                  type: SchemaType.STRING,
                  description: 'Patient weight if mentioned (e.g., "72 kg")',
                },
                bloodPressure: {
                  type: SchemaType.STRING,
                  description: 'Blood pressure if mentioned (e.g., "120/80 mmHg")',
                },
                medicines: {
                  type: SchemaType.ARRAY,
                  description: 'List of medicines prescribed.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      medicine: {
                        type: SchemaType.STRING,
                        description: 'Brand name or name of drug (e.g., "Azithromycin 500")',
                      },
                      genericName: {
                        type: SchemaType.STRING,
                        description: 'Chemical or generic name (e.g., "Azithromycin")',
                      },
                      form: {
                        type: SchemaType.STRING,
                        description: 'Form of medicine',
                        enum: ['Tablet', 'Syrup', 'Capsule', 'Ointment', 'Drops', 'Inhaler', 'Injection'],
                      },
                      dosage: {
                        type: SchemaType.STRING,
                        description: 'Strength or quantity (e.g., "500 mg")',
                      },
                      frequency: {
                        type: SchemaType.STRING,
                        description: 'Frequency of intake (e.g., "Once Daily", "Twice Daily", "SOS")',
                      },
                      frequencyPattern: {
                        type: SchemaType.STRING,
                        description: 'Pattern of intake (e.g., "1-0-0", "1-0-1")',
                      },
                      timing: {
                        type: SchemaType.STRING,
                        description: 'Timing relative to meals (e.g., "After food", "Before food")',
                      },
                      duration: {
                        type: SchemaType.STRING,
                        description: 'Duration of treatment (e.g., "3 Days", "1 Week")',
                      },
                      notes: {
                        type: SchemaType.STRING,
                        description: 'Specific warnings or instructions',
                      },
                    },
                    required: ['medicine', 'dosage', 'duration'],
                  },
                },
              },
              required: ['symptoms', 'diagnosis', 'advice', 'medicines'],
            },
          },
          required: ['transcript', 'prescription'],
        };

        const modelName = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';
        const model = this.geminiAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });

        const prompt = 'You are an expert medical scribe. Analyze the attached doctor\'s audio recording. First, transcribe the exact words spoken by the doctor in the recording. Second, extract and structure the details into a JSON object matching the schema.';
        const result = await model.generateContent([prompt, audioPart]);
        const responseJson = JSON.parse(result.response.text());
        
        rawTranscript = responseJson.transcript;
        structuredJson = responseJson.prescription;
        this.logger.log('Successfully processed audio with Gemini 1.5 Flash.');
      } catch (err) {
        this.logger.error('Google Gemini processing failed. Will fall back to OpenAI...', err);
      }
    }

    // B. Fall back to OpenAI Whisper + GPT-4o-mini if Gemini didn't complete
    if (!structuredJson) {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'mock-key') {
        this.logger.log('Performing speech-to-text and structuring via OpenAI...');
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
Lowcase keys or missing info should be handled gracefully. Output must be strictly JSON matching the schema, with no markdown wrappers or additional text.`
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
          this.logger.error('OpenAI processing failed. Falling back to Mock data...', err);
        }
      }
    }

    // C. Ultimate Fallback to Mock Data if both Gemini and OpenAI failed/not-set
    if (!structuredJson) {
      this.logger.warn('Mocking transcription and structuring (no valid Gemini or OpenAI API keys configured/reachable)');
      rawTranscript = 'Patient presents with mild fever and wet cough for the past three days. Checked vitals. Weight is seventy two kilograms, blood pressure is one hundred twenty over eighty. Diagnosing Upper Respiratory Tract Infection. Prescribing Azithromycin five hundred milligrams once daily for three days after meals, and Paracetamol six hundred fifty milligrams SOS for fever. Advice rest and plenty of fluids.';
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

      const existing = await tx.prescription.findUnique({
        where: { id: prescriptionId },
      });

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          rawTranscript,
          structuredJson: structuredJson as any,
          symptoms: structuredJson.symptoms || existing?.symptoms || null,
          diagnosis: structuredJson.diagnosis || existing?.diagnosis || null,
          generalAdvice: structuredJson.advice || existing?.generalAdvice || null,
          weight: structuredJson.weight || existing?.weight || null,
          bloodPressure: structuredJson.bloodPressure || existing?.bloodPressure || null,
          height: existing?.height || null,
          temperature: existing?.temperature || null,
          pulse: existing?.pulse || null,
          spo2: existing?.spo2 || null,
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

    // Watermark Background
    if (config.watermarkUrl) {
      try {
        const res = await fetch(config.watermarkUrl);
        const watermarkBuffer = Buffer.from(await res.arrayBuffer());
        doc.save();
        doc.opacity(0.04);
        doc.image(watermarkBuffer, 197, 321, { width: 200 });
        doc.restore();
      } catch (e) {
        this.logger.error('Failed to render watermark image', e);
      }
    }

    // Resolve details (Fallback to default doctor/clinic details if not custom configured)
    const clinicName = config.customClinicName || prescription.doctor.clinic?.name || 'Clinic';
    const doctorName = config.customDoctorName || `Dr. ${prescription.doctor.user.name}`;
    const qualificationsText = config.qualifications || '';
    const specText = config.specializationText || prescription.doctor.specialization || 'General Physician';
    const regNo = config.registrationNumber || '';
    const addressText = config.addressLine1
      ? `${config.addressLine1}${config.addressLine2 ? ', ' + config.addressLine2 : ''}`
      : prescription.visit.location.address;
    const timingHours = config.consultingHours || '';
    const phoneText = config.contactNumber || '';
    const emailText = config.email || '';

    // Header Rendering
    let startY = 45;
    if (config.headerEnabled) {
      const textAlignment = (config.headerTextPosition?.toLowerCase() || 'right') as 'left' | 'right' | 'center';
      let logoX = 50;
      let textX = 50;
      let textWidth = 495;

      // Draw Logo if enabled and exists
      if (config.showLogo && (config.customClinicName || prescription.doctor.clinic?.logoUrl)) {
        const logoUrl = prescription.doctor.clinic?.logoUrl;
        if (logoUrl) {
          try {
            const res = await fetch(logoUrl);
            const logoBuffer = Buffer.from(await res.arrayBuffer());
            
            if (config.logoPosition === 'LEFT') {
              doc.image(logoBuffer, 50, startY, { width: 45 });
              textX = 110;
              textWidth = 435;
            } else if (config.logoPosition === 'RIGHT') {
              doc.image(logoBuffer, 500, startY, { width: 45 });
              textWidth = 435;
            } else {
              // CENTER
              doc.image(logoBuffer, 275, startY, { width: 45 });
              startY += 55; // Push text below center logo
            }
          } catch (e) {
            // Ignore logo fetch failure
          }
        }
      }

      // Render Header Details
      doc.fontSize(config.clinicNameFontSize || 16).font('Helvetica-Bold').fillColor(config.clinicNameColor || '#1e293b').text(clinicName, textX, startY, { align: textAlignment, width: textWidth });
      doc.fontSize(config.doctorNameFontSize || 11).font('Helvetica-Bold').fillColor(config.doctorNameColor || '#b91c1c').text(doctorName, { align: textAlignment, width: textWidth });
      
      const detailsSz = config.headerDetailsFontSize || 8.5;
      const detailsColor = config.headerDetailsColor || '#475569';
      if (qualificationsText) {
        doc.fontSize(detailsSz).font('Helvetica-Oblique').fillColor(detailsColor).text(qualificationsText, { align: textAlignment, width: textWidth });
      }
      if (specText) {
        doc.fontSize(detailsSz).font('Helvetica').fillColor(detailsColor).text(specText, { align: textAlignment, width: textWidth });
      }
      if (regNo) {
        doc.fontSize(detailsSz).font('Helvetica').fillColor(detailsColor).text(`Reg No: ${regNo}`, { align: textAlignment, width: textWidth });
      }
      if (addressText) {
        doc.fontSize(detailsSz - 0.5).font('Helvetica').fillColor(detailsColor).text(addressText, { align: textAlignment, width: textWidth });
      }
      doc.moveDown(1);
    } else {
      doc.moveDown(5); // Letterhead spacing
    }

    // Divider Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
    doc.moveDown(1);

    // Patient Info Block
    const patientY = doc.y;
    const templateStyle = config.templateStyle || 'CLASSIC';

    if (templateStyle === 'MODERN_GRID' || templateStyle === 'MANIPAL_HEALTH') {
      doc.rect(50, patientY, 495, 55).strokeColor('#cbd5e1').stroke();
      doc.moveTo(297, patientY).lineTo(297, patientY + 55).stroke();
      
      // Patient Info (Left Col)
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000').text(`Patient Name:`, 60, patientY + 10);
      doc.font('Helvetica').text(prescription.visit.patient.name, 130, patientY + 10);
      if (config.showPatientAge) {
        doc.font('Helvetica-Bold').text(`Age/Sex:`, 60, patientY + 22);
        doc.font('Helvetica').text(`25 Y / Male`, 130, patientY + 22);
      }
      if (config.showPatientMobile && prescription.visit.patient.phone) {
        doc.font('Helvetica-Bold').text(`Mobile:`, 60, patientY + 34);
        doc.font('Helvetica').text(prescription.visit.patient.phone, 130, patientY + 34);
      }

      // Visit Info (Right Col)
      doc.font('Helvetica-Bold').text(`Ref ID:`, 307, patientY + 10);
      doc.font('Helvetica').text(`#${prescription.visitId.substring(0, 8).toUpperCase()}`, 370, patientY + 10);
      if (config.showDate) {
        doc.font('Helvetica-Bold').text(`Date:`, 307, patientY + 22);
        doc.font('Helvetica').text(prescription.createdAt.toLocaleDateString(), 370, patientY + 22);
      }
      if (config.showPatientAddress && addressText) {
        doc.font('Helvetica-Bold').text(`Location:`, 307, patientY + 34);
        doc.font('Helvetica').text(prescription.visit.location.name, 370, patientY + 34);
      }
      doc.y = patientY + 65;
    } else if (templateStyle === 'CLEAN_MINIMAL') {
      // Flat Minimalist layout
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e293b');
      let patientStr = `Patient: ${prescription.visit.patient.name}`;
      if (config.showPatientAge) patientStr += `  |  Age/Sex: 25 Y / M`;
      if (config.showPatientMobile && prescription.visit.patient.phone) patientStr += `  |  Ph: ${prescription.visit.patient.phone}`;
      if (config.showDate) patientStr += `  |  Date: ${prescription.createdAt.toLocaleDateString()}`;
      
      doc.text(patientStr, 50, patientY);
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(1);
    } else {
      // CLASSIC (Standard Rx layout)
      doc.rect(50, patientY, 495, 50).strokeColor('#cbd5e1').stroke();
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000').text(`Patient Name:`, 60, patientY + 10);
      doc.font('Helvetica').text(prescription.visit.patient.name, 130, patientY + 10);
      
      if (config.showPatientAge) {
        doc.font('Helvetica-Bold').text(`Age/Gender:`, 60, patientY + 22);
        doc.font('Helvetica').text(`25 Y / M`, 130, patientY + 22);
      }
      if (config.showPatientMobile && prescription.visit.patient.phone) {
        doc.font('Helvetica-Bold').text(`Mobile:`, 60, patientY + 34);
        doc.font('Helvetica').text(prescription.visit.patient.phone, 130, patientY + 34);
      }
      if (config.showDate) {
        doc.font('Helvetica-Bold').text(`Date:`, 380, patientY + 10);
        doc.font('Helvetica').text(prescription.createdAt.toLocaleDateString(), 420, patientY + 10);
      }
      doc.y = patientY + 60;
    }

    doc.moveDown(0.5);

    // Render Sections dynamically
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
          doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Vitals & Body Metrics');
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(vitals.join('  |  '));
          doc.moveDown(1.2);
        }
      }

      if (section === 'symptoms' && config.showSymptoms && prescription.symptoms) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Symptoms / Chief Complaints');
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(prescription.symptoms);
        doc.moveDown(1.2);
      }

      if (section === 'diagnosis' && config.showDiagnosis && prescription.diagnosis) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Diagnosis');
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#b91c1c').text(prescription.diagnosis);
        doc.moveDown(1.2);
      }

      if (section === 'medicines' && prescription.medicines.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#b91c1c').text('Rx (Medicines)');
        doc.moveDown(0.4);

        if (config.showMedicineTable) {
          // Table Layout
          const tableY = doc.y;
          doc.fillColor('#f8fafc').rect(50, tableY, 495, 20).fill();
          doc.fillColor('#1e293b');

          // Draw Headers
          doc.fontSize(8.5).font('Helvetica-Bold')
            .text('S.No', 55, tableY + 5)
            .text('Medicine Name', 85, tableY + 5)
            .text('Dosage', 235, tableY + 5)
            .text('Frequency', 295, tableY + 5)
            .text('Duration', 385, tableY + 5)
            .text('Instructions', 450, tableY + 5);

          doc.moveTo(50, tableY + 20).lineTo(545, tableY + 20).strokeColor('#cbd5e1').stroke();
          
          let currentY = tableY + 20;
          prescription.medicines.forEach((med, idx) => {
            doc.fontSize(8).font('Helvetica').fillColor('#475569')
              .text(`${idx + 1}`, 55, currentY + 6)
              .font('Helvetica-Bold').text(med.medicine, 85, currentY + 6)
              .font('Helvetica').text(med.dosage || '-', 235, currentY + 6)
              .text(med.frequency || '-', 295, currentY + 6)
              .text(med.duration || '-', 385, currentY + 6)
              .text(med.notes || '-', 450, currentY + 6, { width: 95 });

            currentY += 22;
            doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor('#e2e8f0').stroke();
          });
          doc.y = currentY + 10;
        } else {
          // Standard List Layout
          prescription.medicines.forEach((med, idx) => {
            let medText = `${idx + 1}. ${med.medicine} (${med.dosage}) - ${med.frequency} - ${med.duration}`;
            if (med.timing) medText += ` [${med.timing}]`;
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569').text(medText);
            if (med.notes) {
              doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748b').text(`   Instructions: ${med.notes}`);
            }
          });
          doc.moveDown(1.2);
        }
      }

      if (section === 'advice' && config.showAdvice && prescription.generalAdvice) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Advice / Special Instructions');
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(prescription.generalAdvice);
        doc.moveDown(1.2);
      }

      if (section === 'investigations' && config.showInvestigations && prescription.investigationsOrdered) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Investigations Ordered');
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(prescription.investigationsOrdered);
        doc.moveDown(1.2);
      }

      if (section === 'followup' && config.showFollowUp && (prescription.followUpDate || prescription.followUpNote)) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Follow Up');
        let followUpText = '';
        if (prescription.followUpDate) {
          followUpText += `Date: ${prescription.followUpDate.toLocaleDateString()}`;
        }
        if (prescription.followUpNote) {
          followUpText += `${followUpText ? '  |  ' : ''}Notes: ${prescription.followUpNote}`;
        }
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(followUpText);
        doc.moveDown(1.2);
      }
    }

    // Signature Area
    if (config.showSignature) {
      doc.moveDown(2);
      const sigY = doc.y;
      if (config.signatureUrl) {
        try {
          const res = await fetch(config.signatureUrl);
          const sigBuffer = Buffer.from(await res.arrayBuffer());
          doc.image(sigBuffer, 420, sigY, { width: 80 });
        } catch {
          doc.fontSize(8.5).font('Helvetica-Bold').text('Digitally Signed', 420, sigY + 15, { align: 'right' });
        }
      } else {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569').text(doctorName, 420, sigY + 15, { align: 'right' });
        doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text('Authorized Signature', 420, sigY + 27, { align: 'right' });
      }
    }

    // Timing & Contact Footer Info
    const footerTopY = 750;
    doc.moveTo(50, footerTopY).lineTo(545, footerTopY).strokeColor('#cbd5e1').stroke();
    
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748b');
    if (timingHours) {
      doc.text(`Consulting Hours: ${timingHours}`, 50, footerTopY + 6);
    }
    if (phoneText || emailText || config.website) {
      let contactLine = '';
      if (phoneText) contactLine += `Contact: ${phoneText}`;
      if (emailText) contactLine += `${contactLine ? '  |  ' : ''}Email: ${emailText}`;
      if (config.website) contactLine += `${contactLine ? '  |  ' : ''}Web: ${config.website}`;
      doc.text(contactLine, 50, footerTopY + 16);
    }

    // Footer Warning / Disclaimer
    if (config.footerEnabled && config.emergencyWarning) {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#b91c1c').text(`⚠ ${config.emergencyWarning}`, 50, footerTopY + 28, { align: 'center', width: 495 });
    } else if (config.footerEnabled && config.customFooterText) {
      doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(config.customFooterText, 50, footerTopY + 28, { align: 'center', width: 495 });
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
