import type { PrismaClient } from '@jobpilot/db';
import { cvProfileSchema, type GenerateCvData } from '@jobpilot/shared';
import type { Storage } from '@jobpilot/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Logger } from 'pino';
import { PdfRenderError } from '../cv/chrome.js';
import { tailorCv } from '../cv/tailor.js';
import { renderCvHtml } from '../cv/template.js';

export interface GenerateCvDeps {
  prisma: PrismaClient;
  storage: Storage;
  renderPdf: (html: string) => Promise<Buffer>;
  logger: Logger;
}

export interface GenerateCvResult {
  status: 'ready' | 'already-ready';
  sizeBytes?: number;
}

/**
 * Builds the tailored CV for one cv_versions row and uploads the PDF to
 * storage under the row's s3_key. Safe to run twice: it overwrites the same
 * object and sets the same status.
 */
export function createGenerateCvProcessor(deps: GenerateCvDeps) {
  const { prisma, storage, renderPdf } = deps;

  async function generate(job: Job<GenerateCvData>): Promise<GenerateCvResult> {
    const version = await prisma.cvVersion.findUnique({
      where: { id: job.data.cvVersionId },
      include: {
        user: { select: { cvProfile: { select: { data: true } } } },
        application: {
          select: {
            jobListing: {
              select: { title: true, description: true, company: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!version) throw new UnrecoverableError(`CV version ${job.data.cvVersionId} does not exist`);
    if (version.source !== 'GENERATED') throw new UnrecoverableError('Not a generated CV');
    if (version.status === 'READY') return { status: 'already-ready' };

    const profile = cvProfileSchema.safeParse(version.user.cvProfile?.data);
    if (!profile.success) {
      throw new UnrecoverableError('No valid CV profile: fill in your CV profile first');
    }

    const listing = version.application?.jobListing;
    const html = renderCvHtml(
      tailorCv(
        profile.data,
        listing
          ? {
              title: listing.title,
              company: listing.company.name,
              description: listing.description,
            }
          : null,
      ),
    );
    const pdf = await renderPdf(html);
    await storage.putObject(version.s3Key, pdf, 'application/pdf');
    await prisma.cvVersion.update({
      where: { id: version.id },
      data: { status: 'READY', sizeBytes: pdf.length, error: null },
    });
    return { status: 'ready', sizeBytes: pdf.length };
  }

  return async (job: Job<GenerateCvData>): Promise<GenerateCvResult> => {
    const log = deps.logger.child({
      queue: job.queueName,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });
    try {
      const result = await generate(job);
      log.info({ cvVersionId: job.data.cvVersionId, ...result }, 'Generated CV');
      return result;
    } catch (err) {
      const finalAttempt =
        err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (err instanceof PdfRenderError) log.warn({ stderr: err.stderr }, err.message);
      // Only the last failure is shown to the user: until then it may still succeed.
      if (finalAttempt) {
        const message = err instanceof Error ? err.message : 'CV generation failed';
        await prisma.cvVersion
          .update({
            where: { id: job.data.cvVersionId },
            data: { status: 'FAILED', error: message },
          })
          .catch(() => undefined); // the row may be gone; the job fails either way
      }
      throw err;
    }
  };
}
