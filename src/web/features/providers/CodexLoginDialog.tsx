import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextField } from '../../components/ui/TextField';
import { startCodexLogin } from './api';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name of 1 to 80 characters.')
    .max(80, 'Enter a name of 1 to 80 characters.'),
});
type Values = z.infer<typeof schema>;

/** Names a new Codex connection, then opens its sign-in sandbox. */
export function CodexLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  function close(next: boolean) {
    if (!next) {
      reset();
      setServerError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add a Codex connection"
      description="Staplr opens an isolated sandbox where you sign in to Codex with your own account. The login is stored encrypted so agents can reuse it."
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-status-failed"
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
            const session = await startCodexLogin({ name: values.name });
            close(false);
            await navigate({
              to: '/settings/providers/login/$sessionId',
              params: { sessionId: session.id },
            });
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Connection name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Start sign-in
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
