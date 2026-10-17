import { htmlToText } from '../text.js';

export interface ScoringProfile {
  skills: readonly string[];
  preferredRoles: readonly string[];
  minSalary: number | null;
}

export interface ScoringListing {
  title: string;
  /** HTML as stored. */
  description: string;
  salaryMax: number | null;
}

/** Points per part; they add up to 100. */
export const WEIGHTS = { skills: 60, role: 25, salary: 15 } as const;

/** Mentioning this many of your skills earns full skill points. */
const SKILLS_FOR_FULL_POINTS = 5;

/** Words that say nothing about which role it is. */
const GENERIC_ROLE_WORDS = new Set([
  'senior',
  'junior',
  'mid',
  'lead',
  'staff',
  'principal',
  'engineer',
  'developer',
  'dev',
  'remote',
]);

/**
 * Lower-cases, turns "-", "_" and "/" into spaces, and drops dots inside
 * words, so "Full-Stack" matches "full stack" and "Node.js" matches "nodejs".
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_/]/g, ' ')
    .replace(/\.(?=[a-z0-9])/g, '');
}

/** Whole-term match; "+" and "#" count as word characters so "C++" and "C#" work. */
function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`).test(text);
}

function roleMatches(normalizedTitle: string, role: string): boolean {
  const words = normalize(role)
    .split(/\s+/)
    .filter((w) => w && !GENERIC_ROLE_WORDS.has(w));
  if (words.length === 0) return containsTerm(normalizedTitle, normalize(role).trim());
  // "full stack" should also match "fullstack".
  return (
    words.every((w) => containsTerm(normalizedTitle, w)) ||
    containsTerm(normalizedTitle, words.join(''))
  );
}

/**
 * 0-100. A pure function: same input, same score, no I/O. That keeps it
 * easy to test, and it could move to a worker thread unchanged if it were
 * ever shown to block the event loop.
 */
export function scoreListing(listing: ScoringListing, profile: ScoringProfile): number {
  const title = normalize(listing.title);
  const text = `${title} ${normalize(htmlToText(listing.description))}`;

  const matchedSkills = profile.skills.filter((s) =>
    containsTerm(text, normalize(s).trim()),
  ).length;
  const needed = Math.min(profile.skills.length, SKILLS_FOR_FULL_POINTS);
  const skillPart = needed === 0 ? 0 : Math.min(1, matchedSkills / needed);

  const rolePart = profile.preferredRoles.some((r) => roleMatches(title, r)) ? 1 : 0;

  // Unknown salary gets half points: not a reason to hide a good match.
  const salaryPart =
    profile.minSalary === null
      ? 1
      : listing.salaryMax === null
        ? 0.5
        : listing.salaryMax >= profile.minSalary
          ? 1
          : 0;

  return Math.round(
    skillPart * WEIGHTS.skills + rolePart * WEIGHTS.role + salaryPart * WEIGHTS.salary,
  );
}
