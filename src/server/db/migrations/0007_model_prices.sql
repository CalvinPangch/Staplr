-- List prices per model, with history. Prices are decimal text (USD per million
-- tokens); NULL means Unknown. A change closes the current row and adds a new one.
CREATE TABLE model_price(
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  model TEXT NOT NULL,
  inputPricePerMTok TEXT CHECK(inputPricePerMTok IS NULL OR inputPricePerMTok GLOB '[0-9]*'),
  outputPricePerMTok TEXT CHECK(outputPricePerMTok IS NULL OR outputPricePerMTok GLOB '[0-9]*'),
  priceSource TEXT,
  pricesAsOf TEXT,
  effectiveFrom TEXT NOT NULL,
  effectiveUntil TEXT,
  source TEXT NOT NULL CHECK(source IN ('default','user'))
);
-- at most one current row per provider and model
CREATE UNIQUE INDEX model_price_current ON model_price(provider, model) WHERE effectiveUntil IS NULL;
CREATE INDEX model_price_lookup ON model_price(provider, model, effectiveFrom);
