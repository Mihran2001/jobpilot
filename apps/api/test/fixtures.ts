import type { PrismaClient } from '@jobpilot/db';

/** Creates a source and company to hang listings on. */
export async function createCatalog(prisma: PrismaClient) {
  const source = await prisma.source.create({
    data: { name: 'test-source', kind: 'API', url: 'https://example.com/api' },
  });
  const company = await prisma.company.create({ data: { name: 'Acme' } });
  return { source, company };
}

let counter = 0;

export async function createListing(
  prisma: PrismaClient,
  catalog: Awaited<ReturnType<typeof createCatalog>>,
  overrides: Partial<{
    title: string;
    description: string;
    remote: boolean;
    salaryMax: number | null;
    postedAt: Date;
  }> = {},
) {
  counter += 1;
  return prisma.jobListing.create({
    data: {
      sourceId: catalog.source.id,
      companyId: catalog.company.id,
      externalId: `ext-${counter}`,
      title: overrides.title ?? `Listing ${counter}`,
      description: overrides.description ?? 'A job.',
      url: `https://example.com/jobs/${counter}`,
      location: 'Remote',
      remote: overrides.remote ?? true,
      salaryMax: overrides.salaryMax ?? null,
      postedAt: overrides.postedAt ?? new Date(Date.UTC(2026, 0, counter)),
    },
  });
}
