export interface GoogleProfile {
    sub: string;
    email: string;
    emailVerified: boolean;
  }
  
  export interface GoogleVerifier {
    verify(idToken: string): Promise<GoogleProfile>;
  }