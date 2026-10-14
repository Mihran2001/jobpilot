import {
  applicationStatusSchema,
  type ApplicationDetail,
  type ApplicationList,
  type ApplicationsQuery,
  type ChangeStatusInput,
  type CreateApplicationInput,
} from '@jobpilot/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toApplicationDetail, toApplicationSummary } from './applications.mapper.js';
import { ApplicationsRepository } from './applications.repository.js';

@Injectable()
export class ApplicationsService {
  constructor(private readonly applications: ApplicationsRepository) {}

  async create(userId: string, input: CreateApplicationInput): Promise<ApplicationDetail> {
    if (!(await this.applications.listingExists(input.jobListingId))) {
      throw new NotFoundException('Listing not found');
    }
    return toApplicationDetail(await this.applications.create({ userId, ...input }));
  }

  async list(userId: string, query: ApplicationsQuery): Promise<ApplicationList> {
    const [rows, counts] = await Promise.all([
      this.applications.findManyForUser(userId, query.status),
      this.applications.countByStatus(userId),
    ]);
    return {
      items: rows.map(toApplicationSummary),
      // Statuses with no applications are missing from GROUP BY output; fill in 0.
      counts: Object.fromEntries(
        applicationStatusSchema.options.map((s) => [s, counts.get(s) ?? 0]),
      ) as ApplicationList['counts'],
    };
  }

  async get(userId: string, id: string): Promise<ApplicationDetail> {
    const row = await this.applications.findOneForUser(id, userId);
    if (!row) throw new NotFoundException('Application not found');
    return toApplicationDetail(row);
  }

  async changeStatus(
    userId: string,
    id: string,
    input: ChangeStatusInput,
  ): Promise<ApplicationDetail> {
    const result = await this.applications.transitionStatus({
      id,
      userId,
      toStatus: input.status,
      note: input.note,
    });
    switch (result.kind) {
      case 'ok':
        return toApplicationDetail(result.application);
      case 'not_found':
        throw new NotFoundException('Application not found');
      case 'unchanged':
        throw new BadRequestException(`Application is already ${input.status}`);
      case 'conflict':
        throw new ConflictException('Application was changed by another request; reload and retry');
    }
  }
}
