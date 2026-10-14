import type { User } from '@jobpilot/db';
import type { LoginInput, RegisterInput } from '@jobpilot/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { UsersRepository } from '../users/users.repository.js';
import type { AuthUser } from './auth.types.js';
import { PasswordHasher } from './password-hasher.js';
import { hashSessionToken, newSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LoginResult {
  user: User;
  /** The raw token. It exists only in memory and in the cookie. */
  token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly hasher: PasswordHasher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** A duplicate email surfaces as Prisma P2002, which the filter turns into 409. */
  async register(input: RegisterInput): Promise<LoginResult> {
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({ email: input.email, passwordHash });
    return { user, token: await this.startSession(user.id) };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.email);
    const valid = user
      ? await this.hasher.verify(user.passwordHash, input.password)
      : await this.hasher.verifyAgainstDummy(input.password);
    // One message for both cases, so the response does not reveal whether
    // the email has an account.
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    return { user, token: await this.startSession(user.id) };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashSessionToken(token));
  }

  /** Returns the session's user, or null if the token is unknown or expired. */
  async authenticate(token: string): Promise<AuthUser | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.sessions.findByTokenHash(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= new Date()) {
      await this.sessions.deleteByTokenHash(tokenHash);
      return null;
    }
    return session.user;
  }

  get sessionTtlMs(): number {
    return this.config.SESSION_TTL_DAYS * DAY_MS;
  }

  private async startSession(userId: string): Promise<string> {
    const token = newSessionToken();
    await this.sessions.create({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + this.sessionTtlMs),
    });
    return token;
  }
}
