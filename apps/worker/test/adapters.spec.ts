import { HttpError } from '../src/sources/http.js';
import { createJobicyAdapter } from '../src/sources/jobicy.js';
import { createRemotiveAdapter } from '../src/sources/remotive.js';
import { fakeFetch, fixture } from './helpers.js';

describe('source adapters', () => {
  it('normalises Remotive jobs and skips an invalid one', async () => {
    const adapter = createRemotiveAdapter(fakeFetch({ 'remotive.com': fixture('remotive.json') }));
    const { listings, invalid } = await adapter.fetch('https://remotive.com/api/remote-jobs');

    expect(invalid).toBe(1); // the job without a title
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      externalId: '9000001',
      title: 'Senior Node.js Engineer',
      companyName: 'Fixture & Co', // HTML entity decoded
      location: 'Europe',
      remote: true,
      salaryMin: 120_000,
      salaryMax: 150_000,
    });
    // Remotive's timestamps carry no offset; they are UTC.
    expect(listings[0]?.postedAt.toISOString()).toBe('2026-10-14T20:33:44.000Z');
    expect(listings[1]).toMatchObject({ location: 'Remote', salaryMin: null, salaryMax: null });
  });

  it('keeps only USD yearly salaries from Jobicy', async () => {
    const adapter = createJobicyAdapter(fakeFetch({ 'jobicy.com': fixture('jobicy.json') }));
    const { listings } = await adapter.fetch('https://jobicy.com/api/v2/remote-jobs');

    expect(listings.map((l) => [l.title, l.salaryMin, l.salaryMax])).toEqual([
      ['Full Stack Developer (React, Node.js)', 110_000, 130_000],
      ['Backend Engineer', null, null], // GBP
      ['Contract QA Engineer', null, null], // hourly
    ]);
  });

  it('marks 429 and 5xx as retryable, other 4xx as not', async () => {
    const attempt = (status: number) =>
      createRemotiveAdapter(fakeFetch({ 'remotive.com': status }))
        .fetch('https://remotive.com/api/remote-jobs')
        .catch((err: unknown) => err);

    for (const [status, retryable] of [
      [503, true],
      [429, true],
      [404, false],
      [403, false],
    ] as const) {
      const err = await attempt(status);
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).retryable).toBe(retryable);
    }
  });

  it('gives up on a hanging server after the timeout', async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      });
    const { getJson } = await import('../src/sources/http.js');
    await expect(
      getJson(hanging, 'https://remotive.com/api/remote-jobs', 50),
    ).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
});
