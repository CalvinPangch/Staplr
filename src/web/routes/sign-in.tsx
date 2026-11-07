import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { credentialsSchema, type Credentials } from '../../shared/schemas/auth';
import { api, errorMessage } from '../lib/api';
import { zodResolver } from '../lib/zodResolver';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

export function SignInPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { username: '', password: '' },
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1>Sign in</h1>
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
            await api('/api/session', { method: 'POST', body: values });
            queryClient.clear();
            await router.navigate({ to: '/' });
          } catch (error) {
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" variant="primary" busy={isSubmitting}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
