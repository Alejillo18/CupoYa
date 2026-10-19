import { GoogleProfile, GoogleVerifier } from '../../src/modules/auth/google.verifier';

export class FakeGoogleVerifier implements GoogleVerifier {
  profiles = new Map<string, GoogleProfile>();

  async verify(idToken: string): Promise<GoogleProfile> {
    const profile = this.profiles.get(idToken);
    if (!profile) throw new Error('token inválido');
    return profile;
  }
}