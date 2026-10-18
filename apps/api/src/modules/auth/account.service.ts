import { PrismaClient } from '@jobpilot/db';
import type { Storage } from '@jobpilot/storage';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { STORAGE } from '../../infra/storage/storage.module.js';
import { PasswordHasher } from './password-hasher.js';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly hasher: PasswordHasher,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /**
   * 1. Re-check the password: a stolen session alone cannot delete an account.
   * 2. Delete the user's files (generated and uploaded CVs) from storage.
   * 3. Delete the user row; foreign keys cascade to sessions, profiles,
   *    applications and their history, scores, CV records and saved searches.
   * Files go first: if step 3 failed, the user could retry; the other order
   * could leave files of a deleted account behind with nothing pointing at them.
   * Listings, companies and sources are shared and stay.
   */
  async delete(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.hasher.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Wrong password');
    }
    const files = await this.storage.deletePrefix(`users/${userId}/`);
    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.log({ userId, files }, 'Account deleted');
  }
}
