import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

/**
 * Argon2id with the library defaults (19 MiB memory, 2 passes, 1 lane),
 * which match OWASP's minimum recommendation. The work runs on a libuv
 * thread, so a hash in progress does not block other requests.
 */
@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /**
   * Spends the same time as a real check when the email does not exist, so
   * response timing does not reveal which emails have accounts.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hash('not-a-real-password-used-for-timing');
    await verify(await this.dummyHash, password);
    return false;
  }
}
