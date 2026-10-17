import { PrismaClient, type Source } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SourcesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(): Promise<Source[]> {
    return this.prisma.source.findMany({ orderBy: { name: 'asc' } });
  }
}
