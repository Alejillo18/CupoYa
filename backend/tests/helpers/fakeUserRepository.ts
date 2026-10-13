import { UserRepository, UserRecord } from '../../src/modules/auth/auth.repository';

export class FakeUserRepository implements UserRepository {
  users: UserRecord[] = [];

  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async create(data: { email: string; passwordHash: string }) {
    const user: UserRecord = {
      id: `id-${this.users.length + 1}`,
      email: data.email,
      passwordHash: data.passwordHash,
      role: 'USUARIO',
      failedAttempts: 0,
      lockedUntil: null,
    };
    this.users.push(user);
    return user;
  }

  async registerFailedLogin(id: string, maxAttempts: number, lockUntil: Date) {
    const u = this.users.find((x) => x.id === id)!;
    u.failedAttempts += 1;
    if (u.failedAttempts >= maxAttempts) {
      u.lockedUntil = lockUntil;
      u.failedAttempts = 0;
    }
  }

  async resetFailedLogins(id: string) {
    const u = this.users.find((x) => x.id === id)!;
    u.failedAttempts = 0;
    u.lockedUntil = null;
  }
}