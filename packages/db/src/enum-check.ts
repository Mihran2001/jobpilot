// Compile-time guard: the enums are declared twice, in schema.prisma (for the
// database) and in @jobpilot/shared (for Zod validation in web and api, which
// must not import Prisma). If the two lists differ, this file stops compiling.

import type * as shared from '@jobpilot/shared';
import type * as db from './generated/prisma/enums.js';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type EnumChecks = [
  Assert<Equal<db.ApplicationStatus, shared.ApplicationStatus>>,
  Assert<Equal<db.SourceKind, shared.SourceKind>>,
];
