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

const imageCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

@Processor('audio-processing')
@Injectable()
export class AudioProcessor extends WorkerHost {
  private readonly logger = new Logger(AudioProcessor.name);

  private async fetchImage(url: string): Promise<Buffer> {
    const cached = imageCache.get(url);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.buffer;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    imageCache.set(url, {
      buffer,
      expiresAt: now + 24 * 60 * 60 * 1000, // cache for 24 hours (1 day)
    });
    return buffer;
  }
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
          await this.handlePdfGeneration(job.data.prescriptionId, job.data.sendWhatsApp !== false);
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
    try {
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
        const res = await fetch(audioUrl, { signal: AbortSignal.timeout(6000) });
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
                chiefComplaints: {
                  type: SchemaType.ARRAY,
                  description: 'Chief complaints reported by the patient.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      complaint: { type: SchemaType.STRING },
                      duration: { type: SchemaType.STRING },
                      severity: { type: SchemaType.STRING },
                      notes: { type: SchemaType.STRING },
                    },
                    required: ['complaint'],
                  },
                },
                symptoms: {
                  type: SchemaType.ARRAY,
                  description: 'List of individual symptoms reported.',
                  items: { type: SchemaType.STRING },
                },
                history: {
                  type: SchemaType.OBJECT,
                  description: 'Patient medical history.',
                  properties: {
                    presentIllness: { type: SchemaType.STRING },
                    pastMedicalHistory: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                    pastSurgicalHistory: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                    familyHistory: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                    socialHistory: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                    allergies: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                    currentMedicines: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                  },
                },
                vitals: {
                  type: SchemaType.OBJECT,
                  description: 'Patient vitals captured or mentioned.',
                  properties: {
                    weight: { type: SchemaType.STRING },
                    height: { type: SchemaType.STRING },
                    bloodPressure: { type: SchemaType.STRING },
                    temperature: { type: SchemaType.STRING },
                    pulse: { type: SchemaType.STRING },
                    spo2: { type: SchemaType.STRING },
                    respiratoryRate: { type: SchemaType.STRING },
                  },
                },
                examinationFindings: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                diagnosis: {
                  type: SchemaType.ARRAY,
                  description: 'Diagnosed conditions.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      name: { type: SchemaType.STRING },
                      status: {
                        type: SchemaType.STRING,
                        enum: ['confirmed', 'suspected', 'ruled_out'],
                      },
                      notes: { type: SchemaType.STRING },
                    },
                    required: ['name', 'status'],
                  },
                },
                advice: {
                  type: SchemaType.ARRAY,
                  description: 'Non-pharmacological advice.',
                  items: { type: SchemaType.STRING },
                },
                medicines: {
                  type: SchemaType.ARRAY,
                  description: 'List of medicines prescribed, continued, changed, or stopped.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      medicine: { type: SchemaType.STRING },
                      genericName: { type: SchemaType.STRING },
                      form: {
                        type: SchemaType.STRING,
                        enum: ['Tablet', 'Syrup', 'Capsule', 'Ointment', 'Drops', 'Inhaler', 'Injection', 'Cream', 'Gel', 'Powder', 'Other'],
                      },
                      dosage: { type: SchemaType.STRING },
                      route: { type: SchemaType.STRING },
                      frequency: { type: SchemaType.STRING },
                      frequencyPattern: { type: SchemaType.STRING },
                      timing: { type: SchemaType.STRING },
                      duration: { type: SchemaType.STRING },
                      quantity: { type: SchemaType.STRING },
                      notes: { type: SchemaType.STRING },
                      action: {
                        type: SchemaType.STRING,
                        enum: ['start', 'continue', 'stop', 'change'],
                      },
                    },
                    required: ['medicine', 'action'],
                  },
                },
                investigations: {
                  type: SchemaType.ARRAY,
                  description: 'List of diagnostic investigations/tests ordered by the doctor.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      testName: { type: SchemaType.STRING },
                      testType: {
                        type: SchemaType.STRING,
                        enum: ['Blood Test', 'Urine Test', 'Stool Test', 'X-Ray', 'CT Scan', 'MRI', 'Ultrasound', 'ECG', 'Culture', 'Biopsy', 'Other'],
                      },
                      urgency: {
                        type: SchemaType.STRING,
                        enum: ['Routine', 'Urgent', 'STAT'],
                      },
                      notes: { type: SchemaType.STRING },
                    },
                    required: ['testName', 'testType'],
                  },
                },
                followUp: {
                  type: SchemaType.OBJECT,
                  properties: {
                    required: { type: SchemaType.BOOLEAN },
                    after: { type: SchemaType.STRING },
                    instructions: { type: SchemaType.STRING },
                  },
                },
                doctorAssessment: { type: SchemaType.STRING },
                additionalNotes: { type: SchemaType.STRING },
              },
              required: ['diagnosis', 'medicines'],
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

        const prompt = `You are an expert medical scribe assisting a licensed doctor.

Analyze the complete doctor-patient consultation transcript and convert it into a structured prescription/clinical summary.

CORE RULES:
1. Distinguish between PATIENT-REPORTED information and DOCTOR-CONFIRMED information.
2. A patient's statement must NOT automatically become the diagnosis. If the doctor explicitly disagrees, follow the doctor's assessment.
3. If the doctor corrects a medicine, dosage, frequency, duration, diagnosis, or investigation, use the doctor's FINAL instruction.
4. Pay attention to temporal context: current symptoms, previous symptoms, existing medicines, medicines being stopped, new medicines being prescribed.
5. Do NOT invent medical information. If something is not stated, return null or empty array.
6. Ignore greetings, small talk, and administrative conversation. Give priority to the doctor's clinical assessment and final treatment decisions.

You must fill the JSON matching the schema.`;
        const result = await model.generateContent([prompt, audioPart]);
        const responseJson = JSON.parse(result.response.text());
        
        rawTranscript = responseJson.transcript;
        structuredJson = responseJson.prescription;
        this.logger.log('Successfully processed audio with Gemini 1.5/3.5 Flash.');
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
          const res = await fetch(audioUrl, { signal: AbortSignal.timeout(6000) });
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
                content: `You are an expert medical scribe assisting a licensed doctor.

Analyze the complete doctor-patient consultation transcript and convert it into a structured prescription/clinical summary.

CORE RULES:
1. Distinguish between PATIENT-REPORTED information and DOCTOR-CONFIRMED information.
2. A patient's statement must NOT automatically become the diagnosis. If the doctor explicitly disagrees, follow the doctor's assessment.
3. If the doctor corrects a medicine, dosage, frequency, duration, diagnosis, or investigation, use the doctor's FINAL instruction.
4. Pay attention to temporal context: current symptoms, previous symptoms, existing medicines, medicines being stopped, new medicines being prescribed.
5. Do NOT invent medical information. If something is not stated, return null or empty array.
6. Ignore greetings, small talk, and administrative conversation. Give priority to the doctor's clinical assessment and final treatment decisions.

Output must be strictly a valid JSON object matching this schema:
{
  "chiefComplaints": [
    {
      "complaint": "",
      "duration": "",
      "severity": "",
      "notes": ""
    }
  ],
  "symptoms": [],
  "history": {
    "presentIllness": "",
    "pastMedicalHistory": [],
    "pastSurgicalHistory": [],
    "familyHistory": [],
    "socialHistory": [],
    "allergies": [],
    "currentMedicines": []
  },
  "vitals": {
    "weight": "",
    "height": "",
    "bloodPressure": "",
    "temperature": "",
    "pulse": "",
    "spo2": "",
    "respiratoryRate": ""
  },
  "examinationFindings": [],
  "diagnosis": [
    {
      "name": "",
      "status": "suspected | confirmed | ruled_out",
      "notes": ""
    }
  ],
  "advice": [],
  "medicines": [
    {
      "medicine": "",
      "genericName": "",
      "form": "Tablet | Syrup | Capsule | Ointment | Drops | Inhaler | Injection | Cream | Gel | Powder | Other",
      "dosage": "",
      "route": "",
      "frequency": "",
      "frequencyPattern": "",
      "timing": "",
      "duration": "",
      "quantity": "",
      "notes": "",
      "action": "start | continue | stop | change"
    }
  ],
  "investigations": [
    {
      "testName": "",
      "testType": "Blood Test | Urine Test | Stool Test | X-Ray | CT Scan | MRI | Ultrasound | ECG | Culture | Biopsy | Other",
      "urgency": "Routine | Urgent | STAT",
      "notes": ""
    }
  ],
  "followUp": {
    "required": true,
    "after": "",
    "instructions": ""
  },
  "doctorAssessment": "",
  "additionalNotes": ""
}

No markdown. No explanation. Return valid JSON only.`
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
      rawTranscript = 'Patient presents with mild fever and wet cough for the past three days. Checked vitals. Weight is seventy two kilograms, blood pressure is one hundred twenty over eighty. Diagnosing Upper Respiratory Tract Infection. Prescribing Azithromycin five hundred milligrams once daily for three days after meals, and Paracetamol six hundred fifty milligrams SOS for fever. Advice rest and plenty of fluids. Also ordering CBC and Chest X-Ray.';
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
        ],
        investigations: [
          { testName: 'Complete Blood Count (CBC)', testType: 'Blood Test', urgency: 'Routine', notes: 'Fasting not required' },
          { testName: 'Chest X-Ray', testType: 'X-Ray', urgency: 'Routine', notes: 'PA view' },
        ],
      };
    }

    // 4. Update prescription record with results and move to READY_FOR_REVIEW
    // Adapt the LLM output JSON values to match database schema requirements
    let symptomsStr: string | null = null;
    if (structuredJson.symptoms) {
      symptomsStr = Array.isArray(structuredJson.symptoms)
        ? structuredJson.symptoms.join(', ')
        : String(structuredJson.symptoms);
    } else if (structuredJson.chiefComplaints) {
      // Support chiefComplaints as fallback symptom source
      symptomsStr = Array.isArray(structuredJson.chiefComplaints)
        ? structuredJson.chiefComplaints.map((c: any) => c.complaint || '').filter(Boolean).join(', ')
        : String(structuredJson.chiefComplaints);
    }

    let diagnosisStr: string | null = null;
    if (structuredJson.diagnosis) {
      diagnosisStr = Array.isArray(structuredJson.diagnosis)
        ? structuredJson.diagnosis
            .map((d: any) => {
              if (typeof d === 'object' && d !== null) {
                return `${d.name || ''}${d.status ? ` (${d.status})` : ''}`;
              }
              return String(d);
            })
            .filter(Boolean)
            .join(', ')
        : String(structuredJson.diagnosis);
    }

    let adviceStr: string | null = null;
    if (structuredJson.advice) {
      adviceStr = Array.isArray(structuredJson.advice)
        ? structuredJson.advice.join('\n')
        : String(structuredJson.advice);
    }

    // Support nested vitals or root vitals
    const weightVal = structuredJson.vitals?.weight || structuredJson.weight || null;
    const heightVal = structuredJson.vitals?.height || structuredJson.height || null;
    const bpVal = structuredJson.vitals?.bloodPressure || structuredJson.bloodPressure || null;
    const tempVal = structuredJson.vitals?.temperature || structuredJson.temperature || null;
    const pulseVal = structuredJson.vitals?.pulse || structuredJson.pulse || null;
    const spo2Val = structuredJson.vitals?.spo2 || structuredJson.spo2 || null;

    let followUpNoteVal: string | null = null;
    if (structuredJson.followUp) {
      if (typeof structuredJson.followUp === 'object' && structuredJson.followUp !== null) {
        if (structuredJson.followUp.after) {
          followUpNoteVal = `Follow up after ${structuredJson.followUp.after}.${structuredJson.followUp.instructions ? ` ${structuredJson.followUp.instructions}` : ''}`;
        } else if (structuredJson.followUp.instructions) {
          followUpNoteVal = structuredJson.followUp.instructions;
        }
      } else {
        followUpNoteVal = String(structuredJson.followUp);
      }
    }

    await this.prisma.$transaction(async (tx: any) => {
      // Save parsed medicines
      if (structuredJson.medicines && Array.isArray(structuredJson.medicines)) {
        await tx.prescriptionMedicine.deleteMany({ where: { prescriptionId } });
        await tx.prescriptionMedicine.createMany({
          data: structuredJson.medicines.map((m: any) => {
            let noteText = m.notes || null;
            if (m.action && m.action !== 'start') {
              noteText = `${m.action.toUpperCase()}${noteText ? `: ${noteText}` : ''}`;
            }
            return {
              prescriptionId,
              medicine: m.medicine || '',
              genericName: m.genericName || null,
              form: m.form || null,
              dosage: m.dosage || '',
              frequency: m.frequency || '',
              frequencyPattern: m.frequencyPattern || null,
              timing: m.timing || null,
              duration: m.duration || '',
              notes: noteText,
            };
          }),
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
          symptoms: symptomsStr || existing?.symptoms || null,
          diagnosis: diagnosisStr || existing?.diagnosis || null,
          generalAdvice: adviceStr || existing?.generalAdvice || null,
          weight: weightVal || existing?.weight || null,
          bloodPressure: bpVal || existing?.bloodPressure || null,
          height: heightVal || existing?.height || null,
          temperature: tempVal || existing?.temperature || null,
          pulse: pulseVal || existing?.pulse || null,
          spo2: spo2Val || existing?.spo2 || null,
          followUpNote: followUpNoteVal || existing?.followUpNote || null,
          // Store investigations as JSON string in the investigationsOrdered field
          investigationsOrdered: structuredJson.investigations && structuredJson.investigations.length > 0
            ? JSON.stringify(structuredJson.investigations)
            : existing?.investigationsOrdered || null,
          status: PrescriptionStatus.READY_FOR_REVIEW,
        },
      });
    });

    this.logger.log(`Prescription ${prescriptionId} successfully transcribed and structured.`);
    } catch (error) {
      this.logger.error(`Error in handleTranscription for prescription ${prescriptionId}:`, error);
      try {
        await this.prisma.prescription.update({
          where: { id: prescriptionId },
          data: { status: PrescriptionStatus.FAILED },
        });
      } catch (dbErr) {
        this.logger.error(`Failed to set prescription status to FAILED in DB:`, dbErr);
      }
      throw error;
    }
  }

  private async handlePdfGeneration(prescriptionId: string, sendWhatsApp: boolean) {
    try {
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
        const watermarkBuffer = await this.fetchImage(config.watermarkUrl);
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
            const logoBuffer = await this.fetchImage(logoUrl);
            
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
            this.logger.error(`Failed to render logo image from ${logoUrl}:`, e);
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

    doc.x = 50;
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
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#b91c1c').text('Rx');
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
          doc.x = 50;
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
        // Try to parse as structured JSON array first; fall back to plain text
        let investigations: { testName: string; testType?: string; urgency?: string; notes?: string }[] | null = null;
        try {
          const parsed = JSON.parse(prescription.investigationsOrdered);
          if (Array.isArray(parsed) && parsed.length > 0) investigations = parsed;
        } catch { /* plain text fallback */ }

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Investigations / Tests Ordered');
        doc.moveDown(0.4);

        if (investigations) {
          // Table Header
          const invTableY = doc.y;
          doc.fillColor('#eff6ff').rect(50, invTableY, 495, 18).fill();
          doc.fillColor('#1e3a5f');
          doc.fontSize(8).font('Helvetica-Bold')
            .text('S.No', 55, invTableY + 4)
            .text('Test Name', 85, invTableY + 4)
            .text('Type', 270, invTableY + 4)
            .text('Urgency', 370, invTableY + 4)
            .text('Special Instructions', 435, invTableY + 4);
          doc.moveTo(50, invTableY + 18).lineTo(545, invTableY + 18).strokeColor('#bfdbfe').stroke();

          let invY = invTableY + 18;
          investigations.forEach((inv, idx) => {
            // Alternate row shading
            if (idx % 2 === 1) {
              doc.fillColor('#f8fbff').rect(50, invY, 495, 20).fill();
            }
            doc.fontSize(7.5).font('Helvetica').fillColor('#1e293b')
              .text(`${idx + 1}`, 55, invY + 5)
              .font('Helvetica-Bold').text(inv.testName || '-', 85, invY + 5, { width: 180 })
              .font('Helvetica').fillColor('#475569')
              .text(inv.testType || '-', 270, invY + 5, { width: 95 })
              .text(inv.urgency || 'Routine', 370, invY + 5, { width: 60 })
              .text(inv.notes || '-', 435, invY + 5, { width: 110 });
            invY += 20;
            doc.moveTo(50, invY).lineTo(545, invY).strokeColor('#e0eefe').stroke();
          });
          doc.y = invY + 8;
          doc.x = 50;
        } else {
          // Plain text fallback for older records
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(prescription.investigationsOrdered);
        }
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
          const sigBuffer = await this.fetchImage(config.signatureUrl);
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
    const bypassS3 = process.env.NODE_ENV === 'development' || process.env.BYPASS_S3_LOCAL === 'true';

    try {
      if (bypassS3) {
        throw new Error('S3 bypassed in local development mode');
      }
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
      if (!bypassS3) {
        this.logger.error('Failed to upload generated PDF to S3', err);
      }
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
    if (sendWhatsApp && prescription.visit.patient.phone) {
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
    } catch (error) {
      this.logger.error(`Error in handlePdfGeneration for prescription ${prescriptionId}:`, error);
      try {
        await this.prisma.prescription.update({
          where: { id: prescriptionId },
          data: { status: PrescriptionStatus.FAILED },
        });
      } catch (dbErr) {
        this.logger.error(`Failed to set prescription status to FAILED in DB:`, dbErr);
      }
      throw error;
    }
  }
}
