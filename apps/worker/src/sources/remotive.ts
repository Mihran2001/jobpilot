import { z } from 'zod';
import { decodeEntities } from '../text.js';
import { getJson, type FetchFn } from './http.js';
import { parseUsdYearlyRange } from './salary.js';
import { parseEach, type NormalizedListing, type SourceAdapter } from './types.js';

// https://github.com/remotive-io/remote-jobs-api
// Terms: at most 4 requests a day; link back to the job on Remotive and name
// Remotive as the source; do not pass the jobs on to other job sites.

const responseSchema = z.object({ jobs: z.array(z.unknown()) });

const jobSchema = z.object({
  id: z.number().int(),
  url: z.url(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  description: z.string(),
  // "2026-10-14T20:33:44": no offset, and the values are UTC.
  publication_date: z.iso.datetime({ local: true }),
  candidate_required_location: z.string().default(''),
  salary: z.string().nullish(),
});

function toListing(job: z.infer<typeof jobSchema>): NormalizedListing {
  const salary = parseUsdYearlyRange(job.salary ?? '');
  return {
    externalId: String(job.id),
    title: decodeEntities(job.title).trim(),
    companyName: decodeEntities(job.company_name).trim(),
    description: job.description,
    url: job.url,
    location: job.candidate_required_location.trim() || 'Remote',
    remote: true, // Remotive lists remote jobs only
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    postedAt: new Date(`${job.publication_date}Z`),
  };
}

export function createRemotiveAdapter(fetchFn: FetchFn): SourceAdapter {
  return {
    async fetch(url) {
      const body = responseSchema.parse(await getJson(fetchFn, url));
      return parseEach(body.jobs, jobSchema, toListing);
    },
  };
}
