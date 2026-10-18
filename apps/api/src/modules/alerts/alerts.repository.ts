import { PrismaClient, type Prisma } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';
import { summarySelect } from '../listings/listings.repository.js';

/** Every query is scoped by userId: someone else's search is simply not found. */
@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  countForUser(userId: string): Promise<number> {
    return this.prisma.savedSearch.count({ where: { userId } });
  }

  create(userId: string, name: string, filters: Prisma.InputJsonObject) {
    return this.prisma.savedSearch.create({ data: { userId, name, filters } });
  }

  /** With the number of unseen matches per search, counted in the database. */
  listForUser(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { matches: { where: { seenAt: null } } } } },
    });
  }

  findOwned(id: string, userId: string) {
    return this.prisma.savedSearch.findFirst({ where: { id, userId } });
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.savedSearch.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  matches(savedSearchId: string, userId: string) {
    return this.prisma.searchMatch.findMany({
      where: { savedSearchId, savedSearch: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { createdAt: true, seenAt: true, jobListing: { select: summarySelect(userId) } },
    });
  }

  async markSeen(savedSearchId: string, userId: string): Promise<number> {
    const { count } = await this.prisma.searchMatch.updateMany({
      where: { savedSearchId, seenAt: null, savedSearch: { userId } },
      data: { seenAt: new Date() },
    });
    return count;
  }

  unseenForUser(userId: string): Promise<number> {
    return this.prisma.searchMatch.count({ where: { seenAt: null, savedSearch: { userId } } });
  }
}
