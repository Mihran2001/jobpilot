import { PrismaClient } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
