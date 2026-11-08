import type { ModelAccess } from '../../../shared/schemas/providers';

type Price = NonNullable<ModelAccess['price']>;

/** "$2 in / $10 out per 1M tokens", or "Unknown" when the official page does not list it. */
export function priceText(price: Price | undefined): string {
  if (
    !price ||
    price.inputPricePerMTok === null ||
    price.outputPricePerMTok === null
  )
    return 'Unknown';
  return `$${price.inputPricePerMTok} in / $${price.outputPricePerMTok} out per 1M tokens`;
}

/**
 * The list price beside a model (FR-019): labelled "List price used for
 * estimates", with its official source page and date, or "Unknown".
 */
export function ModelPrice({ price }: { price: Price | undefined }) {
  const known = priceText(price) !== 'Unknown';
  return (
    <span className="flex flex-col text-sm text-muted">
      <span>
        List price used for estimates: {priceText(price)}
        {known && price?.priceSource && (
          <>
            {' · '}
            <a
              href={price.priceSource}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              official price page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        )}
        {known && price?.pricesAsOf && (
          <>
            {', '}
            <time dateTime={price.pricesAsOf}>{price.pricesAsOf}</time>
          </>
        )}
      </span>
      {price?.note && <span>{price.note}</span>}
    </span>
  );
}
