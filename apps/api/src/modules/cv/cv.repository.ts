import { PrismaClient, type CvVersion, type Prisma } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';

/** All reads and writes of cv_profiles and cv_versions, always scoped by user. */
@Injectable()
export class CvRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findProfile(userId: string): Promise<{ data: Prisma.JsonValue } | null> {
    return this.prisma.cvProfile.findUnique({ where: { userId }, select: { data: true } });
  }

  async upsertProfile(userId: string, data: Prisma.InputJsonObject): Promise<void> {
    await this.prisma.cvProfile.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
  }

  /** The application with its listing title, or null if it is not this user's. */
  findApplication(id: string, userId: string) {
    return this.prisma.application.findFirst({
      where: { id, userId },
      select: { id: true, jobListing: { select: { title: true } } },
    });
  }

  createVersion(data: Prisma.CvVersionUncheckedCreateInput): Promise<CvVersion> {
    return this.prisma.cvVersion.create({ data });
  }

  findVersion(id: string, userId: string): Promise<CvVersion | null> {
    return this.prisma.cvVersion.findFirst({ where: { id, userId } });
  }

  listVersions(userId: string, applicationId?: string): Promise<CvVersion[]> {
    return this.prisma.cvVersion.findMany({
      where: { userId, applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateVersion(
    id: string,
    data: Pick<Prisma.CvVersionUpdateInput, 'status' | 'sizeBytes' | 'error'>,
  ): Promise<CvVersion> {
    return this.prisma.cvVersion.update({ where: { id }, data });
  }
}
