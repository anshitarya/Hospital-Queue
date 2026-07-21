import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  },
})
export class BillingGateway implements OnGatewayInit {
  private readonly logger = new Logger(BillingGateway.name);
  @WebSocketServer() server!: Server;

  afterInit(server: Server) {
    this.logger.log('Billing Socket.IO gateway initialized');
  }

  broadcastEvent(event: any) {
    if (this.server) {
      this.server.emit('billing:event_logged', event);
      this.server.emit(`billing:business:${event.businessId}`, event);
    }
  }
}
