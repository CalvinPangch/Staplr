# Board performance (SC-009) results

Source: `tests/e2e/board-perf.spec.ts`, raw numbers in `test-results/board-perf.json`.
Run 2026-11-08: production build (`npm run build`, one process serving API and web,
`NODE_ENV=production`), Chromium via Playwright, Node 22.19, Windows, 200 persisted tickets,
50 samples each, fresh page per board-open sample, response-acknowledged move timing (optimistic
rendering not counted), reload checked afterwards.

| Measure | p95 | median | limit |
|---|---|---|---|
| Board open, 200 cards rendered and usable | 127 ms | 114 ms | 1000 ms |
| Mouse drop to committed-move response | 61 ms | 45 ms | 500 ms |
| Keyboard confirm to committed-move response | 80 ms | 48 ms | 500 ms |

Host: Intel Core i5-14400F (16 logical cores), 31.8 GiB RAM. **This is not the documented 2-vCPU
host.** The margins are large (about 8x and 6x), but the result should be repeated on the target
host before SC-009 is treated as met there.
