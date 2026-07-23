import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { QueueGateway } from './gateway/queue.gateway';
import { EtaService } from './eta.service';
import { CustomerService } from '../patients/customer.service';
import { UsageEventService } from '../billing/usage-event.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClinicsService } from '../clinics/clinics.service';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('QueueService', () => {
  let service: QueueService;
  let prisma: any;
  let gateway: any;

  const mockCaller = { id: 'u-staff-1', role: Role.RECEPTIONIST } as any;

  const mockPrismaService: any = {
    doctor: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'doc-1',
        clinicId: 'clinic-1',
        status: 'ONLINE',
        user: { name: 'Dr. Smith' },
        department: { name: 'Cardiology' },
        clinic: { id: 'clinic-1', businessType: 'CLINIC' },
        locations: [{ locationId: 'loc-1' }],
      }),
      findFirst: jest.fn(),
    },
    doctorLocation: {
      findMany: jest.fn().mockResolvedValue([{ locationId: 'loc-1' }]),
    },
    businessSetting: {
      findMany: jest.fn().mockResolvedValue([{ allowOnlineBooking: true }]),
      findUnique: jest.fn().mockResolvedValue({ allowOnlineBooking: true }),
    },
    staffLeave: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    queueEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn(),
    },
    queueEvent: {
      create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    },
    patient: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    professionalSchedule: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 'shift-1', startTime: '09:00', endTime: '17:00', isHoliday: false, maxCapacity: 2 }]),
    },
    location: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 'loc-1', name: 'Main Location' }),
    },
    userLocation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    receptionistAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrismaService)),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockGateway = {
    emitQueueUpdate: jest.fn(),
    emitPositionUpdate: jest.fn(),
    emitToPatientRoom: jest.fn(),
    emitToDoctorRoom: jest.fn(),
  };

  const mockEtaService = {
    enrich: jest.fn((entries) => entries),
    enrichEntries: jest.fn((entries) => entries),
    invalidateCache: jest.fn(),
    getMovingAvg: jest.fn().mockResolvedValue(10),
  };

  const mockCustomerService = {
    findOrCreateCustomer: jest.fn(),
    upsertByPhone: jest.fn().mockResolvedValue({ id: 'pat-1', name: 'John Doe', phone: '+919876543210' }),
  };

  const mockUsageEventService = {
    triggerEvent: jest.fn(),
  };

  const mockNotificationsService = {
    sendQueueUpdate: jest.fn(),
  };

  const mockClinicsService = {
    findOne: jest.fn(),
    assertCallerCanAccessDoctor: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: QueueGateway, useValue: mockGateway },
        { provide: EtaService, useValue: mockEtaService },
        { provide: CustomerService, useValue: mockCustomerService },
        { provide: UsageEventService, useValue: mockUsageEventService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ClinicsService, useValue: mockClinicsService },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    prisma = module.get(PrismaService);
    gateway = module.get(QueueGateway);
  });

  describe('Self-Booking Capacity Limits', () => {
    const mockDoctor = {
      id: 'doc-1',
      clinicId: 'clinic-1',
      status: 'ONLINE',
      user: { name: 'Dr. Smith' },
      department: { name: 'Cardiology' },
      clinic: { id: 'clinic-1', businessType: 'CLINIC' },
      locations: [{ locationId: 'loc-1' }],
    };

    it('enforces maxCapacity strictly on patient self-bookings (joinByPatient)', async () => {
      prisma.doctor.findUnique.mockResolvedValue(mockDoctor);
      mockCustomerService.findOrCreateCustomer.mockResolvedValue({ id: 'pat-2', name: 'Alice', phone: '+919876543211' });

      // Active shift with maxCapacity = 2
      prisma.professionalSchedule.findFirst.mockResolvedValue({
        id: 'shift-1',
        maxCapacity: 2,
        isHoliday: false,
        startTime: '09:00',
        endTime: '17:00',
      });

      // 2 existing active bookings
      prisma.queueEntry.count.mockResolvedValue(2);

      // Patient self-booking call (joinByPatient) should throw BadRequestException
      await expect(
        service.joinByPatient('pat-2', 'doc-1'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.queueEntry.create).not.toHaveBeenCalled();
    });

    it('allows staff walk-in entry even when maxCapacity is reached (joinByReception)', async () => {
      prisma.doctor.findUnique.mockResolvedValue(mockDoctor);
      mockCustomerService.findOrCreateCustomer.mockResolvedValue({ id: 'pat-1', name: 'John Doe', phone: '+919876543210' });

      // Active shift with maxCapacity = 2
      prisma.professionalSchedule.findFirst.mockResolvedValue({
        id: 'shift-1',
        maxCapacity: 2,
        isHoliday: false,
        startTime: '09:00',
        endTime: '17:00',
      });

      // 2 existing active bookings
      prisma.queueEntry.count.mockResolvedValue(2);

      const newEntry = {
        id: 'entry-staff-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        status: 'WAITING',
        tokenNumber: 'A-003',
        serviceDay: '2026-07-23',
        patient: { id: 'pat-1', name: 'John Doe', phone: '+919876543210' },
      };
      prisma.queueEntry.create.mockResolvedValue(newEntry);
      prisma.queueEntry.findMany.mockResolvedValue([newEntry]);
      prisma.queueEntry.findFirst.mockResolvedValue(null);

      // Staff joinByReception call
      const res = await service.joinByReception(
        { doctorId: 'doc-1', patientName: 'John Doe', patientPhone: '+919876543210' },
        mockCaller,
      );

      expect(res).toBeDefined();
      expect(prisma.queueEntry.create).toHaveBeenCalled();
    });
  });

  describe('Queue Entry Status Transitions', () => {
    it('completes queue entry and broadcasts socket update', async () => {
      let statusState = 'IN_CONSULTATION';
      const mockEntry = {
        id: 'entry-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        get status() { return statusState; },
        serviceDay: '2026-07-23',
        version: 1,
        doctor: { id: 'doc-1' },
      };

      prisma.queueEntry.findUnique.mockImplementation(async () => mockEntry);
      prisma.queueEntry.updateMany.mockImplementation(async () => {
        statusState = 'COMPLETED';
        return { count: 1 };
      });

      prisma.queueEntry.findMany.mockResolvedValue([{ ...mockEntry, status: 'COMPLETED' }]);

      const res = await service.complete('entry-1', mockCaller);
      expect(res.status).toBe('COMPLETED');
    });

    it('marks queue entry missed and allows staff to rejoin entry', async () => {
      let statusState = 'WAITING';
      const mockEntry = {
        id: 'entry-missed-1',
        doctorId: 'doc-1',
        patientId: 'pat-1',
        get status() { return statusState; },
        serviceDay: '2026-07-23',
        version: 1,
        doctor: { id: 'doc-1' },
        missedCount: 1,
      };

      prisma.queueEntry.findUnique.mockImplementation(async () => mockEntry);
      prisma.queueEntry.updateMany.mockImplementation(async () => {
        statusState = 'MISSED';
        return { count: 1 };
      });

      prisma.queueEntry.findMany.mockResolvedValue([{ ...mockEntry, status: 'MISSED' }]);

      // Mark missed
      const missed = await service.markMissed('entry-missed-1', mockCaller);
      expect(missed.status).toBe('MISSED');

      // Rejoin missed
      prisma.queueEntry.findUnique.mockResolvedValue({ ...mockEntry, status: 'MISSED' });
      prisma.queueEntry.create.mockResolvedValue({ ...mockEntry, id: 'entry-rejoined-1', status: 'WAITING' });

      const rejoined = await service.rejoinQueue('entry-missed-1', mockCaller);
      expect(rejoined.status).toBe('WAITING');
    });
  });
});
