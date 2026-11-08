-- Reverse of 0009. Official price rows become 'default' rows (the closest earlier meaning);
-- hand-set prices closed by the upgrade stay closed.
CREATE TABLE model_price_old(
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
INSERT INTO model_price_old SELECT id,provider,model,inputPricePerMTok,outputPricePerMTok,priceSource,pricesAsOf,effectiveFrom,effectiveUntil,
  CASE source WHEN 'official' THEN 'default' ELSE source END FROM model_price;
DROP TABLE model_price;
ALTER TABLE model_price_old RENAME TO model_price;
CREATE UNIQUE INDEX model_price_current ON model_price(provider, model) WHERE effectiveUntil IS NULL;
CREATE INDEX model_price_lookup ON model_price(provider, model, effectiveFrom);

DROP TABLE price_refresh;
DROP TABLE discovered_model;
ALTER TABLE provider_connection DROP COLUMN modelsRefreshedAt;
ALTER TABLE provider_connection DROP COLUMN discoveryError;
ALTER TABLE provider_connection DROP COLUMN discoveryStatus;
