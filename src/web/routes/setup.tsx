import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { credentialsSchema } from '../../shared/schemas/auth';
import { ApiError, api, errorMessage } from '../lib/api';
import { zodResolver } from '../lib/zodResolver';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

const setupSchema = z
  .object({
    ...credentialsSchema.shape,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });
type SetupValues = z.infer<typeof setupSchema>;

export function SetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  return (
    <div className="auth-panel mx-auto flex max-w-md flex-col gap-4">
      <h1>Create the owner account</h1>
      <p className="text-muted">
        This installation has one owner. Choose a username and a password of at
        least 12 characters; you will use them to sign in.
      </p>
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          {serverError}
        </p>
      )}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setServerError(null);
          try {
            await api('/api/setup', {
              method: 'POST',
              body: { username: values.username, password: values.password },
            });
            queryClient.clear();
            await router.navigate({ to: '/' });
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              await router.navigate({ to: '/sign-in' });
              return;
            }
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Username"
          autoComplete="username"
          error={errors.username?.message}
          {...register('username')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" variant="primary" busy={isSubmitting}>
          Create account
        </Button>
      </form>
    </div>
  );
}
