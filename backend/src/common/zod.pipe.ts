import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from './errors';

export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) throw new AppError('VALIDATION_FAILED', 'Validation failed', r.error.issues);
    return r.data;
  }
}
/** Shorthand: @Body(Z(schema)) */
export const Z = <T>(schema: ZodType<T>) => new ZodPipe(schema);
