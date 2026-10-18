import { randomUUID } from 'node:crypto';
import {
  cvProfileSchema,
  type CreateCvUploadInput,
  type CvProfile,
  type CvUploadResponse,
  type CvVersionResponse,
  type GenerateCvData,
  type PresignedUrl,
} from '@jobpilot/shared';
import type { Storage } from '@jobpilot/storage';
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ENQUEUE_TIMEOUT_MS, withTimeout } from '../../common/with-timeout.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { GENERATE_CV_QUEUE } from '../../infra/queue/queue.module.js';
import { STORAGE } from '../../infra/storage/storage.module.js';
import { toCvVersionResponse } from './cv.mapper.js';
import { CvRepository } from './cv.repository.js';

/** Characters that break file names on some systems. */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const unsafeFileName = /[\\/:*?"<>|\u0000-\u001f]+/g;

function pdfName(...parts: string[]): string {
  const base = parts.join(' - ').replace(unsafeFileName, ' ').replace(/\s+/g, ' ').trim();
  return `${base.slice(0, 110) || 'CV'}.pdf`;
}

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly cv: CvRepository,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(GENERATE_CV_QUEUE) private readonly generateQueue: Queue<GenerateCvData>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async getProfile(userId: string): Promise<CvProfile> {
    const row = await this.cv.findProfile(userId);
    if (!row) throw new NotFoundException('No CV profile yet');
    // Stored JSON is re-validated on the way out: the column itself has no shape.
    return cvProfileSchema.parse(row.data);
  }

  async saveProfile(userId: string, profile: CvProfile): Promise<CvProfile> {
    await this.cv.upsertProfile(userId, profile);
    return profile;
  }

  /**
   * Creates a PENDING version and queues the job; the worker does the work.
   * The row (Postgres) and the job (Redis) cannot be written in one
   * transaction: if queueing fails, the row is marked FAILED rather than
   * left PENDING forever.
   */
  async requestGenerated(userId: string, applicationId: string): Promise<CvVersionResponse> {
    const application = await this.cv.findApplication(applicationId, userId);
    if (!application) throw new NotFoundException('Application not found');
    const profile = await this.getProfile(userId).catch(() => null);
    if (!profile) throw new BadRequestException('Fill in your CV profile first');

    // Per-user quota: each CV is a Chrome run on a small server.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if ((await this.cv.countGeneratedSince(userId, today)) >= this.config.CV_DAILY_LIMIT) {
      throw new HttpException(
        `Daily limit of ${this.config.CV_DAILY_LIMIT} generated CVs reached; try again tomorrow`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const version = await this.cv.createVersion({
      userId,
      applicationId,
      source: 'GENERATED',
      s3Key: `users/${userId}/cv/${randomUUID()}.pdf`,
      fileName: pdfName(profile.fullName, application.jobListing.title),
    });

    try {
      // BullMQ waits for Redis to be reachable, potentially forever, so the
      // wait is capped. jobId = version id: if a timed-out add still lands
      // later, there is still only one job for this version.
      await withTimeout(
        this.generateQueue.add('generate', { cvVersionId: version.id }, { jobId: version.id }),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.error({ err, cvVersionId: version.id }, 'Could not queue CV generation');
      await this.cv.updateVersion(version.id, {
        status: 'FAILED',
        error: 'Could not queue the job',
      });
      throw new ServiceUnavailableException('CV generation is unavailable, try again later');
    }
    return toCvVersionResponse(version);
  }

  async list(userId: string, applicationId?: string): Promise<CvVersionResponse[]> {
    return (await this.cv.listVersions(userId, applicationId)).map(toCvVersionResponse);
  }

  async get(userId: string, id: string): Promise<CvVersionResponse> {
    return toCvVersionResponse(await this.ownedVersion(userId, id));
  }

  async download(userId: string, id: string): Promise<PresignedUrl> {
    const version = await this.ownedVersion(userId, id);
    if (version.status !== 'READY')
      throw new ConflictException(`CV is ${version.status.toLowerCase()}`);
    return this.storage.presignDownload(version.s3Key, version.fileName);
  }

  /**
   * Step 1 of an upload: record the expected file and hand out a URL that
   * only accepts exactly that type and size. The bytes go from the browser
   * straight to storage.
   */
  async createUpload(userId: string, input: CreateCvUploadInput): Promise<CvUploadResponse> {
    if (input.applicationId && !(await this.cv.findApplication(input.applicationId, userId))) {
      throw new NotFoundException('Application not found');
    }
    const version = await this.cv.createVersion({
      userId,
      applicationId: input.applicationId ?? null,
      source: 'UPLOADED',
      s3Key: `users/${userId}/uploads/${randomUUID()}.pdf`,
      fileName: pdfName(input.fileName.replace(/\.pdf$/i, '')),
      sizeBytes: input.sizeBytes,
    });
    const upload = await this.storage.presignUpload(version.s3Key, {
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    return { cvVersion: toCvVersionResponse(version), upload };
  }

  /**
   * Step 2: the client says it has uploaded. Trust nothing it says; check
   * what is actually in storage.
   */
  async completeUpload(userId: string, id: string): Promise<CvVersionResponse> {
    const version = await this.ownedVersion(userId, id);
    if (version.source !== 'UPLOADED') throw new BadRequestException('Not an upload');
    if (version.status === 'READY') return toCvVersionResponse(version); // repeated call

    const object = await this.storage.headObject(version.s3Key);
    if (!object) throw new BadRequestException('The file has not been uploaded yet');
    if (object.sizeBytes !== version.sizeBytes) throw new BadRequestException('File size mismatch');
    const signature = Buffer.from(await this.storage.readPrefix(version.s3Key, 5)).toString(
      'latin1',
    );
    if (signature !== '%PDF-') throw new BadRequestException('The file is not a PDF');

    return toCvVersionResponse(
      await this.cv.updateVersion(version.id, { status: 'READY', sizeBytes: object.sizeBytes }),
    );
  }

  private async ownedVersion(userId: string, id: string) {
    const version = await this.cv.findVersion(id, userId);
    if (!version) throw new NotFoundException('CV not found');
    return version;
  }
}
