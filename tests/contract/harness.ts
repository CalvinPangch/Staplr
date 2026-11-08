import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
interface Media {
  schema?: Record<string, unknown>;
}
interface Response {
  content?: Record<string, Media>;
}
interface Contract {
  components: Record<string, unknown>;
  paths: Record<
    string,
    Record<string, { responses: Record<string, Response> }>
  >;
}
const document = parseDocument(
  readFileSync(
    'specs/001-agent-team-orchestration/contracts/openapi.yaml',
    'utf8',
  ),
);
if (document.errors.length) throw new Error('Invalid OpenAPI YAML');
const contract = document.toJS() as Contract;
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat(
  'date-time',
  (value) =>
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value)),
);
ajv.addFormat(
  'date',
  (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(value).toISOString().slice(0, 10) === value,
);
ajv.addFormat('uri', (value) => {
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
});
ajv.addSchema({ $id: 'staplr', components: contract.components });
export function validateResponse(
  path: string,
  method: string,
  status: number,
  body: unknown,
  media = 'application/json',
) {
  const response =
    contract.paths[path]?.[method.toLowerCase()]?.responses[String(status)];
  if (!response)
    throw new Error(`Undeclared response ${method} ${path}: ${status}`);
  const selected = response.content?.[media];
  if (!selected) {
    if (response.content) throw new Error('Unexpected response media type');
    return;
  }
  const schema = selected.schema;
  if (!schema) return;
  const wrapped = JSON.parse(
    JSON.stringify(schema).replaceAll('"#/components/', '"staplr#/components/'),
  ) as Record<string, unknown>;
  const check = ajv.compile(wrapped);
  if (!check(body)) throw new Error(ajv.errorsText(check.errors));
}
