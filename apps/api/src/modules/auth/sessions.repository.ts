import { PrismaClient } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';

export interface SessionWithUser {
  expiresAt: Date;
  user: { id: string; email: string };
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.prisma.session.create({ data });
  }

  findByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, user: { select: { id: true, email: true } } },
    });
  }

  /** deleteMany rather than delete: logging out twice is not an error. */
  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }
}
