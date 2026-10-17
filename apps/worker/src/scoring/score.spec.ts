import { scoreListing, type ScoringProfile } from './score.js';

const profile: ScoringProfile = {
  skills: [
    'TypeScript',
    'React',
    'Next.js',
    'Node.js',
    'NestJS',
    'PostgreSQL',
    'Prisma',
    'Redis',
    'Docker',
  ],
  preferredRoles: ['Full-Stack Engineer', 'Backend Engineer', 'Node.js Developer'],
  minSalary: 60_000,
};

describe('scoreListing', () => {
  it('gives full marks to a matching role with enough skills and salary', () => {
    const score = scoreListing(
      {
        title: 'Node.js Developer (NestJS, PostgreSQL)',
        description: '<p>NestJS monolith with Prisma, BullMQ workers and Redis.</p>',
        salaryMax: 80_000,
      },
      profile,
    );
    expect(score).toBe(100);
  });

  it('matches across spelling variants: Full-Stack/full stack/fullstack, Node.js/nodejs', () => {
    const listing = (title: string) => ({
      title,
      description: 'nodejs, react, typescript, docker, redis',
      salaryMax: null,
    });
    expect(scoreListing(listing('Senior Full-Stack Engineer'), profile)).toBe(93);
    expect(scoreListing(listing('Full Stack Engineer'), profile)).toBe(93);
    expect(scoreListing(listing('Fullstack Engineer'), profile)).toBe(93);
  });

  it('scores an unrelated job low', () => {
    const score = scoreListing(
      {
        title: 'Data Engineer (Python, Airflow)',
        description: 'ETL pipelines on AWS.',
        salaryMax: null,
      },
      profile,
    );
    expect(score).toBeLessThan(20);
  });

  it('does not match a skill inside another word', () => {
    const score = scoreListing(
      { title: 'Writer', description: 'Reactive prose, predocker era.', salaryMax: null },
      { skills: ['React', 'Docker'], preferredRoles: [], minSalary: null },
    );
    expect(score).toBe(15); // only the salary part: no minimum set
  });

  it('reads skills from HTML descriptions, not from tag names', () => {
    const score = scoreListing(
      {
        title: 'Engineer',
        description: '<redis-widget>Python only</redis-widget>',
        salaryMax: null,
      },
      { skills: ['Redis'], preferredRoles: [], minSalary: null },
    );
    expect(score).toBe(15);
  });

  it('penalises a salary below the minimum and half-credits an unknown one', () => {
    // Skills: 1 of 5 needed (Node.js) = 12. Role: "Backend Engineer" = 25.
    // Salary: 15 if enough, 7.5 if unknown (44.5 rounds to 45), 0 if too low.
    const base = { title: 'Backend Engineer', description: 'Node.js' };
    expect(scoreListing({ ...base, salaryMax: 90_000 }, profile)).toBe(52);
    expect(scoreListing({ ...base, salaryMax: null }, profile)).toBe(45);
    expect(scoreListing({ ...base, salaryMax: 40_000 }, profile)).toBe(37);
  });
});
