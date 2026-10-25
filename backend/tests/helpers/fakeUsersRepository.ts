import {
    ManagedUser,
    RoleChangeResult,
    UsersRepository,
  } from '../../src/modules/users/users.repository';
  import { RoleName } from '../../src/modules/auth/token.service';
  
  export class FakeUsersRepository implements UsersRepository {
    users: ManagedUser[] = [];
  
    async list(page: number, pageSize: number) {
      const start = (page - 1) * pageSize;
      return { items: this.users.slice(start, start + pageSize), total: this.users.length };
    }
  
    async findById(id: string) {
      return this.users.find((u) => u.id === id) ?? null;
    }
  
    async updateRole(id: string, role: RoleName): Promise<RoleChangeResult> {
      const u = this.users.find((x) => x.id === id);
      if (!u) return 'NO_EXISTE';
      const admins = this.users.filter((x) => x.role === 'ADMIN').length;
      if (u.role === 'ADMIN' && role !== 'ADMIN' && admins <= 1) return 'ULTIMO_ADMIN';
      u.role = role;
      return 'OK';
    }
  }