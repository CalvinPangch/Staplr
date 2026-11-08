import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ticketInputSchema,
  type Ticket,
} from '../../../shared/schemas/tickets';
import { api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';

// The form always holds a description (possibly empty); the API treats it as optional.
const formSchema = ticketInputSchema.required({ description: true });
type Values = { title: string; description: string };

/** Create (no `ticket`) or edit a ticket. Text is plain text, never markup. */
export function TicketDialog({
  projectId,
  ticket,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  ticket?: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (ticket: Ticket) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: ticket?.title ?? '',
      description: ticket?.description ?? '',
    },
  });

  function close(next: boolean) {
    if (!next) {
      reset({
        title: ticket?.title ?? '',
        description: ticket?.description ?? '',
      });
      setServerError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={ticket ? 'Edit ticket' : 'New ticket'}
      description={
        ticket ? undefined : 'The ticket is added to the top of the New column.'
      }
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
            const saved = ticket
              ? await api<Ticket>(`/api/tickets/${ticket.id}`, {
                  method: 'PATCH',
                  body: values,
                })
              : await api<Ticket>(`/api/projects/${projectId}/tickets`, {
                  method: 'POST',
                  body: values,
                });
            onSaved(saved);
            reset({ title: '', description: '' });
            onOpenChange(false);
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Title"
          autoComplete="off"
          maxLength={200}
          error={errors.title?.message}
          {...register('title')}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextArea
              label="Description"
              maxLength={20000}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={errors.description?.message}
            />
          )}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            {ticket ? 'Save ticket' : 'Create ticket'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
