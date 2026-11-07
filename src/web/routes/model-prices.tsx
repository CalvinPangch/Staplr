import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { priceInputSchema, type ModelPrice } from '../../shared/schemas/prices';
import { api, errorMessage } from '../lib/api';
import { zodResolver } from '../lib/zodResolver';
import { Button } from '../components/ui/Button';
import { DataState } from '../components/ui/DataState';
import { Dialog } from '../components/ui/Dialog';
import { useAnnounce } from '../components/ui/LiveRegion';
import { TextField } from '../components/ui/TextField';
import { providerName } from '../features/providers/api';
import { formatTime } from '../features/source-control/api';

const pricesKey = ['model-prices'] as const;
const label = 'List price used for estimates';

type Values = {
  provider: ModelPrice['provider'];
  model: string;
  inputPricePerMTok: string;
  outputPricePerMTok: string;
};

function EditDialog({
  price,
  open,
  onOpenChange,
}: {
  price: ModelPrice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(priceInputSchema),
    defaultValues: {
      provider: price.provider,
      model: price.model,
      inputPricePerMTok: price.inputPricePerMTok ?? '',
      outputPricePerMTok: price.outputPricePerMTok ?? '',
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
      title={`${price.inputPricePerMTok === null ? 'Enter' : 'Edit'} the price for ${price.model}`}
      description="Prices are US dollars per million tokens. A new price applies from now on; earlier runs keep the price that applied when they ran. These are list prices for estimates, not invoices."
    >
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
            await api<ModelPrice>('/api/model-prices', {
              method: 'POST',
              body: values,
            });
            await queryClient.invalidateQueries({ queryKey: pricesKey });
            announce(`Price saved for ${price.model}.`);
            onOpenChange(false);
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Input price per million tokens (USD)"
          inputMode="decimal"
          autoComplete="off"
          error={errors.inputPricePerMTok?.message}
          {...register('inputPricePerMTok')}
        />
        <TextField
          label="Output price per million tokens (USD)"
          inputMode="decimal"
          autoComplete="off"
          error={errors.outputPricePerMTok?.message}
          {...register('outputPricePerMTok')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Save price
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PriceCard({
  current,
  history,
}: {
  current: ModelPrice;
  history: ModelPrice[];
}) {
  const [editing, setEditing] = useState(false);
  const unknown = current.inputPricePerMTok === null;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-edge-soft bg-surface p-4">
      <h3 className="break-all text-lg font-semibold">{current.model}</h3>
      {unknown ? (
        <p>
          <strong>Unknown</strong>: no verified price is known for this model.
          Estimates stay “Unknown” until you enter one.
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Input</dt>
          <dd>${current.inputPricePerMTok} per million tokens</dd>
          <dt className="text-muted">Output</dt>
          <dd>${current.outputPricePerMTok} per million tokens</dd>
        </dl>
      )}
      <p className="text-sm text-muted">{label}</p>
      <p className="text-sm">
        {current.source === 'user' ? (
          <>
            Set by you on{' '}
            <time dateTime={current.effectiveFrom}>
              {formatTime(current.effectiveFrom)}
            </time>
            .
          </>
        ) : current.priceSource && current.pricesAsOf ? (
          <>
            Copied from{' '}
            <a
              href={current.priceSource}
              rel="noreferrer noopener"
              target="_blank"
              className="underline"
            >
              the provider pricing page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>{' '}
            on <time dateTime={current.pricesAsOf}>{current.pricesAsOf}</time>.
          </>
        ) : (
          'No verified source yet.'
        )}
      </p>
      <div>
        <Button onClick={() => setEditing(true)}>
          {unknown ? 'Enter price' : 'Edit price'}
          <span className="sr-only"> for {current.model}</span>
        </Button>
      </div>
      {history.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">
            Price history ({history.length})
          </summary>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {history.map((row) => (
              <li key={row.id}>
                {row.inputPricePerMTok === null
                  ? 'Unknown'
                  : `$${row.inputPricePerMTok} in / $${row.outputPricePerMTok} out`}
                {' · '}
                {row.source === 'user' ? 'set by you' : 'default'}
                {' · '}
                <time dateTime={row.effectiveFrom}>
                  {formatTime(row.effectiveFrom)}
                </time>
                {' to '}
                {row.effectiveUntil ? (
                  <time dateTime={row.effectiveUntil}>
                    {formatTime(row.effectiveUntil)}
                  </time>
                ) : (
                  'now'
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {editing && (
        <EditDialog price={current} open={editing} onOpenChange={setEditing} />
      )}
    </li>
  );
}

export function ModelPricesPage() {
  const query = useQuery({
    queryKey: pricesKey,
    queryFn: () => api<ModelPrice[]>('/api/model-prices'),
  });
  const rows = query.data ?? [];
  const providers = [...new Set(rows.map((r) => r.provider))];
  return (
    <div className="flex flex-col gap-4">
      <h1>Model prices</h1>
      <p className="text-muted">
        {label}: every figure here is an estimate, never an invoice or an actual
        provider charge. Claude is billed directly through your API key. Codex
        uses your account, so list-price estimates may differ from what you are
        charged.
      </p>
      <DataState
        what="model prices"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={rows.length === 0}
        empty={<p>No models are listed yet.</p>}
        onRetry={() => void query.refetch()}
      >
        {providers.map((provider) => {
          const forProvider = rows.filter((r) => r.provider === provider);
          const models = [...new Set(forProvider.map((r) => r.model))];
          return (
            <section
              key={provider}
              aria-labelledby={`prices-${provider}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`prices-${provider}`}>{providerName[provider]}</h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {models.map((model) => {
                  const own = forProvider.filter((r) => r.model === model);
                  const current = own.find((r) => r.effectiveUntil === null);
                  if (!current) return null;
                  return (
                    <PriceCard
                      key={model}
                      current={current}
                      history={own
                        .filter((r) => r.effectiveUntil !== null)
                        .reverse()}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
      </DataState>
    </div>
  );
}
