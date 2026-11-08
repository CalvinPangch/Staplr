-- Feature 002: remembered Codex models per connection, and prices read from the providers'
-- official pages instead of being typed in.

-- Discovery state on each connection (only Codex connections leave not_started). The allowed
-- values are checked by the application: SQLite cannot drop a column that has a CHECK, and this
-- migration must stay reversible.
ALTER TABLE provider_connection ADD COLUMN discoveryStatus TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE provider_connection ADD COLUMN discoveryError TEXT;
ALTER TABLE provider_connection ADD COLUMN modelsRefreshedAt TEXT;

-- Models a login listed, including ones not in Staplr's shipped catalog. Whether each is usable
-- is kept in model_access, bound to the credential revision.
CREATE TABLE discovered_model(
  providerConnectionId TEXT NOT NULL REFERENCES provider_connection(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
  listedAt TEXT NOT NULL,
  PRIMARY KEY(providerConnectionId, model)
);

-- When each provider's official pricing page was last read.
CREATE TABLE price_refresh(
  provider TEXT PRIMARY KEY NOT NULL CHECK(provider IN ('claude','codex')),
  lastAttemptAt TEXT,
  lastSuccessAt TEXT,
  lastError TEXT
);

-- model_price gains the 'official' source. SQLite cannot alter a CHECK, so the table is rebuilt
-- with the same rows and indexes.
CREATE TABLE model_price_new(
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  model TEXT NOT NULL,
  inputPricePerMTok TEXT CHECK(inputPricePerMTok IS NULL OR inputPricePerMTok GLOB '[0-9]*'),
  outputPricePerMTok TEXT CHECK(outputPricePerMTok IS NULL OR outputPricePerMTok GLOB '[0-9]*'),
  priceSource TEXT,
  pricesAsOf TEXT,
  effectiveFrom TEXT NOT NULL,
  effectiveUntil TEXT,
  source TEXT NOT NULL CHECK(source IN ('default','user','official'))
);
INSERT INTO model_price_new SELECT id,provider,model,inputPricePerMTok,outputPricePerMTok,priceSource,pricesAsOf,effectiveFrom,effectiveUntil,source FROM model_price;
DROP TABLE model_price;
ALTER TABLE model_price_new RENAME TO model_price;
CREATE UNIQUE INDEX model_price_current ON model_price(provider, model) WHERE effectiveUntil IS NULL;
CREATE INDEX model_price_lookup ON model_price(provider, model, effectiveFrom);

-- Prices can no longer be typed in: close every current hand-set price now and keep it as history.
UPDATE model_price
SET effectiveUntil = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE source = 'user' AND effectiveUntil IS NULL;
