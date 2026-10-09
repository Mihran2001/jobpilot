import { z } from 'zod';

// These lists must match the enums in packages/db/prisma/schema.prisma.
// packages/db/src/enum-check.ts fails the build if they drift apart.

export const applicationStatusSchema = z.enum([
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const sourceKindSchema = z.enum(['API', 'RSS']);
export type SourceKind = z.infer<typeof sourceKindSchema>;
