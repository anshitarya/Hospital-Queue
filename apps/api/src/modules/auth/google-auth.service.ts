import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>('google.clientId') ?? '';
    this.client = new OAuth2Client(this.clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleUserPayload> {
    if (!this.clientId) {
      throw new UnauthorizedException(
        'Google authentication is not configured. Set GOOGLE_CLIENT_ID.',
      );
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Empty token payload');
      if (!payload.email) throw new Error('Token has no email claim');
      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name ?? payload.email,
        picture: payload.picture,
        emailVerified: payload.email_verified ?? false,
      };
    } catch (err) {
      this.logger.warn(`Google token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired Google ID token');
    }
  }
}
