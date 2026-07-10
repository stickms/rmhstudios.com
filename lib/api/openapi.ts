/**
 * Generates an OpenAPI 3.1 document from the endpoint registry. Pure — served
 * verbatim at `/api/v1/openapi.json` so clients can codegen SDKs. Response
 * bodies are described with examples (and a permissive object schema) rather
 * than fully-typed schemas; the required scope is surfaced via the
 * `x-required-scope` extension and in each operation description.
 */

import { ENDPOINTS, API_BASE_URL, API_VERSION, type ApiEndpoint } from '@/lib/api/registry';

function operationFor(ep: ApiEndpoint) {
  const parameters = (ep.params ?? []).map((p) => ({
    name: p.name,
    in: p.in,
    required: p.in === 'path' ? true : !!p.required,
    description: p.description,
    schema: { type: p.type },
  }));

  const op: Record<string, unknown> = {
    operationId: ep.operationId,
    summary: ep.summary,
    description: ep.scope ? `${ep.description}\n\nRequires the \`${ep.scope}\` scope.` : ep.description,
    tags: [ep.group],
  };
  if (ep.scope) op['x-required-scope'] = ep.scope;
  if (ep.idempotent) {
    op['x-idempotent'] = true;
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: false,
      description: 'Optional client-generated key so a retried request is not applied twice.',
      schema: { type: 'string' },
    } as never);
  }
  if (parameters.length) op.parameters = parameters;
  // Meta/unauthenticated endpoints opt out of the global security requirement.
  if (!ep.scope && ep.group === 'Meta') op.security = [];

  if (ep.requestBody) {
    const props: Record<string, unknown> = {};
    for (const f of ep.requestBody.fields ?? []) {
      props[f.name] = { type: f.type.endsWith('[]') ? 'array' : f.type === 'file' ? 'string' : f.type, description: f.description };
    }
    op.requestBody = {
      required: true,
      content: {
        [ep.requestBody.contentType ?? 'application/json']: {
          schema: { type: 'object', properties: props },
          ...(ep.requestBody.example !== undefined ? { example: ep.requestBody.example } : {}),
        },
      },
    };
  }

  const successStatus = String(ep.status ?? 200);
  const responses: Record<string, unknown> = {};
  if (successStatus === '204') {
    responses[successStatus] = { description: 'No Content' };
  } else {
    responses[successStatus] = {
      description: 'Success',
      content: {
        'application/json': {
          schema: { type: 'object' },
          ...(ep.responseExample !== undefined ? { example: ep.responseExample } : {}),
        },
      },
    };
  }
  // Common error responses (reference the shared Error schema).
  const errRef = { $ref: '#/components/schemas/Error' };
  if (ep.scope) {
    responses['401'] = { description: 'Authentication failed', content: { 'application/json': { schema: errRef } } };
    responses['403'] = { description: 'Insufficient scope or entitlement', content: { 'application/json': { schema: errRef } } };
  }
  responses['429'] = { description: 'Rate limited', content: { 'application/json': { schema: errRef } } };
  op.responses = responses;

  return op;
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const tags = new Set<string>();

  for (const ep of ENDPOINTS) {
    tags.add(ep.group);
    const path = (paths[ep.path] ??= {});
    path[ep.method.toLowerCase()] = operationFor(ep);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'RMH Studios API',
      version: API_VERSION,
      description:
        'The RMH Studios REST API. Authenticate every request with an API key (Bearer or X-API-Key). ' +
        'Requires an active Starter subscription or higher. Errors use a stable `{ error: { type, code, message, request_id } }` envelope.',
      contact: { name: 'RMH Studios', url: `${API_BASE_URL}/developer` },
    },
    servers: [{ url: API_BASE_URL }],
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    tags: [...tags].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Authorization: Bearer rmh_live_…' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'X-API-Key: rmh_live_…' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'Broad error category.' },
                code: { type: 'string', description: 'Stable machine-readable reason.' },
                message: { type: 'string', description: 'Human-readable description.' },
                request_id: { type: 'string', description: 'Echo of the X-Request-Id for support.' },
              },
              required: ['type', 'code', 'message'],
            },
          },
          required: ['error'],
        },
      },
    },
  };
}
