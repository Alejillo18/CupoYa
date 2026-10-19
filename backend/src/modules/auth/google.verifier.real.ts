import { OAuth2Client } from 'google-auth-library';
import { GoogleProfile, GoogleVerifier } from './google.verifier';

export class GoogleAuthVerifier implements GoogleVerifier {
  private readonly client: OAuth2Client;

  constructor(
    private readonly clientId: string,
    client?: OAuth2Client,
  ) {
    if (!clientId) {
      throw new Error('Falta GOOGLE_CLIENT_ID');
    }
    this.client = client ?? new OAuth2Client(clientId);
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    // Valida firma, vencimiento y que el token sea para ESTA aplicación (audience).
    const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new Error('El token de Google no trae sub o email');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
    };
  }
}