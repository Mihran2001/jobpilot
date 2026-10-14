import { z } from 'zod';

const tag = z.string().trim().min(1).max(50);

export const skillProfileSchema = z.object({
  skills: z.array(tag).max(100),
  preferredRoles: z.array(tag).max(20),
  minSalary: z.number().int().positive().nullable(),
});
export type SkillProfileInput = z.infer<typeof skillProfileSchema>;
