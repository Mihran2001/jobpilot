import { matchesSearch, type MatchableListing } from './match.js';

const listing: MatchableListing = {
  title: 'Senior Node.js Engineer',
  description: '<p>NestJS and <b>PostgreSQL</b></p>',
  remote: true,
  salaryMax: 120_000,
};

describe('matchesSearch', () => {
  it('matches with no filters at all', () => {
    expect(matchesSearch(listing, {}, 10)).toBe(true);
  });

  it('searches title and description, ignoring case', () => {
    expect(matchesSearch(listing, { q: 'node' }, 50)).toBe(true);
    expect(matchesSearch(listing, { q: 'postgresql' }, 50)).toBe(true);
    expect(matchesSearch(listing, { q: 'python' }, 50)).toBe(false);
  });

  it('applies remote, salary and score like the listings endpoint', () => {
    expect(matchesSearch(listing, { remote: false }, 50)).toBe(false);
    expect(matchesSearch(listing, { minSalary: 120_000 }, 50)).toBe(true);
    expect(matchesSearch(listing, { minSalary: 120_001 }, 50)).toBe(false);
    expect(matchesSearch({ ...listing, salaryMax: null }, { minSalary: 1 }, 50)).toBe(false);
    expect(matchesSearch(listing, { minScore: 80 }, 79)).toBe(false);
    expect(matchesSearch(listing, { minScore: 80 }, 80)).toBe(true);
  });

  it('needs every filter to pass', () => {
    expect(matchesSearch(listing, { q: 'node', remote: true, minScore: 90 }, 85)).toBe(false);
  });
});
