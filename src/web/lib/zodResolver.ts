import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/** Small react-hook-form resolver for Zod schemas (no extra dependency). */
export function zodResolver<T extends FieldValues>(
  schema: ZodType<T>,
): Resolver<T> {
  return async (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of parsed.error.issues) {
      const name = issue.path.join('.');
      if (!errors[name])
        errors[name] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
