import { PrismaClient, type User } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';

/** The only place that runs queries against the users table. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: { email: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
