import { Prisma } from '@jobpilot/db';
import {
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Maps the Prisma errors that mean "the client asked for something
 * impossible" to 4xx responses. Anything else is a bug and becomes a 500
 * whose body reveals nothing about the database.
 */
export function prismaErrorToHttp(error: Prisma.PrismaClientKnownRequestError): HttpException {
  switch (error.code) {
    case 'P2002': // unique constraint violated
      return new ConflictException('Resource already exists');
    case 'P2025': // record required by the operation was not found
      return new NotFoundException('Resource not found');
    default:
      return new InternalServerErrorException();
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const http = prismaErrorToHttp(error);
    const status = http.getStatus();
    if (status >= 500) {
      this.logger.error({ err: error, prismaCode: error.code }, 'Unhandled Prisma error');
    }
    host.switchToHttp().getResponse<Response>().status(status).json(http.getResponse());
  }
}
