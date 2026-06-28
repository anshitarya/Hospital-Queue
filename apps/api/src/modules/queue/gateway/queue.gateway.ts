import { Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parse as parseCookies } from 'cookie';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QueueService } from '../queue.service';

/**
 * Realtime gateway. Two kinds of rooms:
 *
 *   doctor:{id}    — any client watching a specific doctor's queue
 *                    (reception screen, the doctor's own dashboard, the public
 *                    TV display, and a patient who is already in that queue).
 *
 *   patient:{id}   — a single authenticated patient. Used for "your status
 *                    changed" notifications that don't require the patient to
 *                    know which doctor's room to join. This makes the patient
 *                    page update the instant reception checks them in — before
 *                    the next REST poll.
 *
 * Authentication is best-effort: tokens are validated if present so that
 * we can scope private payloads, but the gateway also accepts anonymous
 * connections for the public TV display board.
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  },
})
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(QueueGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => QueueService)) private readonly queue: QueueService,
  ) {}

  async handleConnection(client: Socket) {
    // Try cookie first (browser clients with withCredentials), then auth field (fallback).
    const rawCookie = client.handshake.headers?.cookie ?? '';
    const cookies = parseCookies(rawCookie);
    const token =
      cookies.hq_session ??
      (client.handshake.auth?.token as string | undefined) ??
      undefined;

    if (token) {
      try {
        const payload = this.jwt.verify(token, {
          secret: this.config.get<string>('jwt.secret'),
        });
        client.data.userId = payload.sub;
        client.data.role = payload.role;
      } catch {
        this.logger.debug(`Socket ${client.id} sent invalid token`);
      }
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected ${client.id}`);
  }

  @SubscribeMessage('subscribe:doctor')
  async subscribeDoctor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { doctorId: string },
  ) {
    if (!body?.doctorId) return { ok: false, error: 'doctorId required' };
    await client.join(`doctor:${body.doctorId}`);
    // Send the current snapshot immediately so clients don't need a separate REST call.
    const snapshot = await this.queue.snapshot(body.doctorId);
    return { ok: true, snapshot };
  }

  @SubscribeMessage('unsubscribe:doctor')
  async unsubscribeDoctor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { doctorId: string },
  ) {
    if (!body?.doctorId) return { ok: false };
    await client.leave(`doctor:${body.doctorId}`);
    return { ok: true };
  }

  /**
   * Patient subscribes to their own private room. We use the authenticated
   * `client.data.userId` rather than trusting the body — preventing a client
   * from joining someone else's stream.
   */
  @SubscribeMessage('subscribe:patient')
  async subscribePatient(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'auth required' };
    await client.join(`patient:${userId}`);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe:patient')
  async unsubscribePatient(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false };
    await client.leave(`patient:${userId}`);
    return { ok: true };
  }

  emitToDoctorRoom(doctorId: string, event: string, payload: unknown) {
    this.server?.to(`doctor:${doctorId}`).emit(event, payload);
  }

  emitToPatientRoom(userId: string, event: string, payload: unknown) {
    this.server?.to(`patient:${userId}`).emit(event, payload);
  }
}
