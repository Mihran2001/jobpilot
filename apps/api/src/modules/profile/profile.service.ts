import { PrismaClient } from '@jobpilot/db';
import type { RescoreUserData, SkillProfileInput } from '@jobpilot/shared';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ENQUEUE_TIMEOUT_MS, withTimeout } from '../../common/with-timeout.js';
import { RESCORE_USER_QUEUE } from '../../infra/queue/queue.module.js';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaClient,
    @Inject(RESCORE_USER_QUEUE) private readonly rescoreQueue: Queue<RescoreUserData>,
  ) {}

  async get(userId: string): Promise<SkillProfileInput> {
    const profile = await this.prisma.skillProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('No skill profile yet');
    return {
      skills: profile.skills,
      preferredRoles: profile.preferredRoles,
      minSalary: profile.minSalary,
    };
  }

  /**
   * Saves the profile, then asks the worker to score every listing again for
   * this user. If Redis is unreachable the profile is still saved: scores
   * catch up at the next fetch, so this is not worth failing the request.
   */
  async save(userId: string, input: SkillProfileInput): Promise<SkillProfileInput> {
    await this.prisma.skillProfile.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    try {
      // One rescore per user at a time: saving twice quickly queues it once.
      await withTimeout(
        this.rescoreQueue.add(
          'rescore',
          { userId },
          { deduplication: { id: `rescore-${userId}` } },
        ),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.warn(
        { err, userId },
        'Could not queue a rescore; scores update at the next fetch',
      );
    }
    return input;
  }
}
