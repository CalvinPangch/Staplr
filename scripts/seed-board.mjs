// Development helper: adds tickets to a project board, spread across the four
// columns, through the real ticket service.
//   npm run seed:board -- --project <id> --count <n>
// It refuses to run when NODE_ENV=production. The data folder is DATA_DIR
// (default ./data, or .dev-data when started by `npm run dev`).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { tsImport } from 'tsx/esm/api';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:board refuses to run when NODE_ENV=production.');
  process.exit(1);
}

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const projectId = option('project');
const count = Number(option('count') ?? 20);
if (!projectId || !Number.isInteger(count) || count < 1 || count > 2000) {
  console.error('Usage: npm run seed:board -- --project <id> --count <1-2000>');
  process.exit(2);
}

const dataDir =
  process.env.DATA_DIR ?? (existsSync('.dev-data') ? '.dev-data' : './data');
const file = join(dataDir, 'staplr.db');
if (!existsSync(file)) {
  console.error(`No database at ${file}. Start Staplr once, or set DATA_DIR.`);
  process.exit(1);
}

const { createTicketService } = await tsImport(
  '../src/server/modules/tickets/service.ts',
  import.meta.url,
);
const db = new Database(file);
db.pragma('foreign_keys = ON');
const tickets = createTicketService({ db, clock: Date.now });
const statuses = ['new', 'review', 'testing', 'end'];
try {
  for (let i = 0; i < count; i++) {
    const ticket = tickets.create(projectId, {
      title: `Seeded ticket ${i + 1}`,
      description: 'Created by npm run seed:board for testing the board.',
    });
    const target = statuses[i % 4];
    if (target !== 'new') tickets.move(ticket.id, target, 0);
  }
  console.log(`Added ${count} tickets to project ${projectId}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seeding failed.');
  process.exitCode = 1;
} finally {
  db.close();
}
