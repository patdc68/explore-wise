import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import * as contracts from '../../../packages/place-presentation/src/contracts.ts';
const { categoryFallbackPresentation } = contracts;
const requireMobile = createRequire(new URL('../../../apps/mobile/package.json', import.meta.url));
const ts = requireMobile('typescript') as typeof import('typescript');

const id = '11111111-1111-4111-8111-111111111111';

function loadHandler() {
  const code = ts.transpileModule(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), {
    fileName: 'index.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: any = {};
  let handler: ((request: Request) => Promise<Response> | Response) | undefined;
  const env: Record<string, string> = {
    SUPABASE_PUBLISHABLE_KEY: 'PUBLIC_TEST_KEY',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'SERVER_ONLY_TEST_KEY',
    GOOGLE_PLACES_API_KEY: 'SERVER_GOOGLE_KEY',
  };
  class FakePresentationService {
    async present(request: any) {
      return {
        response: { responseVersion: 1, presentations: [categoryFallbackPresentation(request.ewPlaceIds[0], 'food.restaurant', 'no_photo')] },
        googleSuccessCount: 0,
        fallbackCounts: { no_photo: 1 },
        googleCallCount: 0,
      };
    }
  }
  new Function('exports', 'require', 'Deno', code)(exports, (name: string) => {
    if (name === 'npm:@supabase/supabase-js@2.113.0') return { createClient: () => ({}) };
    if (name === '../../../packages/place-presentation/src/contracts.ts') return contracts;
    if (name === './google.ts') return { GooglePlacesPresentationClient: class {} };
    if (name === './repository.ts') return { SupabasePresentationRepository: class {} };
    if (name === './service.ts') return { PlacePresentationService: FakePresentationService };
    throw new Error(`Unexpected index dependency: ${name}`);
  }, {
    env: { get: (name: string) => env[name] },
    serve: (next: (request: Request) => Promise<Response> | Response) => { handler = next; },
  });
  assert.ok(handler);
  return handler!;
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request('https://project.supabase.co/functions/v1/get-place-presentation', {
    method: 'POST',
    headers: { apikey: 'PUBLIC_TEST_KEY', 'content-type': 'application/json', ...headers },
    body,
  });
}

test('OPTIONS exposes CORS and no-store without invoking the database', async () => {
  const response = await loadHandler()(new Request('https://project.supabase.co/functions/v1/get-place-presentation', { method: 'OPTIONS' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /x-client-info/);
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
});

test('the public-key boundary and request contract fail before planner work', async () => {
  const handler = loadHandler();
  const unauthorized = await handler(new Request('https://project.supabase.co/functions/v1/get-place-presentation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(unauthorized.status, 401);
  const malformed = await handler(request('{not-json'));
  assert.equal(malformed.status, 400);
  const invalid = await handler(request(JSON.stringify({ requestVersion: 2, ewPlaceIds: [id], variant: 'thumbnail' })));
  assert.equal(invalid.status, 400);
});

test('a valid canonical request returns a no-store versioned fallback response', async () => {
  const response = await loadHandler()(request(JSON.stringify({ requestVersion: 1, ewPlaceIds: [id], variant: 'thumbnail' })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    responseVersion: 1,
    presentations: [categoryFallbackPresentation(id, 'food.restaurant', 'no_photo')],
  });
});
