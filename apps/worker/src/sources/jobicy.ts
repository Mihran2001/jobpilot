import { z } from 'zod';
import { decodeEntities } from '../text.js';
import { getJson, type FetchFn } from './http.js';
import { parseEach, type NormalizedListing, type SourceAdapter } from './types.js';

// https://jobicy.com/jobs-rss-feed
// Terms: at most one automated pass per hour; credit Jobicy with a clickable
// link and send apply buttons to the job URL from the feed.

const responseSchema = z.object({ jobs: z.array(z.unknown()) });

const jobSchema = z.object({
  id: z.number().int(),
  url: z.url(),
  jobTitle: z.string().min(1),
  companyName: z.string().min(1),
  jobDescription: z.string(),
  jobGeo: z.string().default(''),
  pubDate: z.iso.datetime({ offset: true }),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});

function toListing(job: z.infer<typeof jobSchema>): NormalizedListing {
  // Only USD per year is kept (see the decisions log): mixing currencies or
  // hourly rates into one number would make filters and scores wrong.
  const usdYearly = job.salaryCurrency === 'USD' && job.salaryPeriod === 'yearly';
  return {
    externalId: String(job.id),
    title: decodeEntities(job.jobTitle).trim(),
    companyName: decodeEntities(job.companyName).trim(),
    description: job.jobDescription,
    url: job.url,
    location: job.jobGeo.trim() || 'Anywhere',
    remote: true, // Jobicy lists remote jobs only
    salaryMin: usdYearly && job.salaryMin != null ? Math.round(job.salaryMin) : null,
    salaryMax: usdYearly && job.salaryMax != null ? Math.round(job.salaryMax) : null,
    postedAt: new Date(job.pubDate),
  };
}

export function createJobicyAdapter(fetchFn: FetchFn): SourceAdapter {
  return {
    async fetch(url) {
      const body = responseSchema.parse(await getJson(fetchFn, url));
      return parseEach(body.jobs, jobSchema, toListing);
    },
  };
}
