import { Prisma } from '@jobpilot/db';
import { prismaErrorToHttp } from './prisma-exception.filter.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test', { code, clientVersion: 'test' });

describe('prismaErrorToHttp', () => {
  it('maps a unique violation (P2002) to 409', () => {
    expect(prismaErrorToHttp(prismaError('P2002')).getStatus()).toBe(409);
  });

  it('maps a missing record (P2025) to 404', () => {
    expect(prismaErrorToHttp(prismaError('P2025')).getStatus()).toBe(404);
  });

  it('maps anything else to a 500 without database details', () => {
    const http = prismaErrorToHttp(prismaError('P2003'));
    expect(http.getStatus()).toBe(500);
    expect(JSON.stringify(http.getResponse())).not.toContain('test');
  });
});
