import { RoleName } from '../modules/auth/token.service';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: RoleName };
    }
  }
}

export {};