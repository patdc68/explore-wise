import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React, { act } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Window } from 'happy-dom';
import ts from 'typescript';

// Compile the real component with the existing TypeScript dependency. Mock only
// the Next router/link boundary and Supabase; hooks and DOM events use real React.
const source = readFileSync(new URL('../src/app/auth/confirm/confirm-client.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const testToken = 'test-only-confirmation-token';
const validQuery = `token_hash=${testToken}&type=email`;

function fixture({ query = validQuery, configured = true, verify } = {}) {
  const calls = [];
  const clients = [];
  const logs = [];
  const exports = {};
  let currentQuery = query;
  const modules = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: (props) => React.createElement('a', props), __esModule: true },
    'next/navigation': { useSearchParams: () => new URLSearchParams(currentQuery) },
    '@supabase/supabase-js': {
      createClient: (url, key, options) => {
        clients.push({ url, key, options });
        return { auth: { verifyOtp: (args) => {
          calls.push(args);
          return verify ? verify(args) : Promise.resolve({ error: null });
        } } };
      },
    },
  };
  vm.runInNewContext(compiled, {
    exports,
    console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug', 'trace'].map((method) => [method, (...args) => logs.push(args)])),
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
      return modules[name];
    },
    process: { env: configured ? {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test-only.example.invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only-publishable-key',
    } : {} },
  });
  const element = () => React.createElement(React.StrictMode, null, React.createElement(exports.ConfirmClient));
  return { calls, clients, logs, element, setQuery: (value) => { currentQuery = value; } };
}

async function mount(t, options) {
  const window = new Window({ url: 'https://test-only.example.invalid/auth/confirm' });
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const app = fixture(options);
  const render = () => act(() => root.render(app.element()));
  t.after(async () => {
    assert.equal(app.logs.length, 0, 'confirmation must not log token or error details');
    await act(() => root.unmount());
    window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
  await render();
  return {
    ...app, container, render,
    click: () => act(() => container.querySelector('button')?.click()),
    openApp: () => container.querySelector('a[href="explorewise://auth/callback"]'),
  };
}

test('server rendering never creates a Supabase client or verifies a token', () => {
  const app = fixture();
  const html = renderToString(app.element());
  assert.match(html, /Confirm email/);
  assert.ok(!html.includes(testToken));
  assert.equal(app.clients.length, 0);
  assert.equal(app.calls.length, 0);
});

test('initial load, Strict Mode effects and fresh search-param objects stay passive', async (t) => {
  const app = await mount(t);
  await app.render();
  await app.render();
  assert.equal(app.container.querySelector('h1').textContent, 'Confirm your email');
  assert.equal(app.container.querySelector('button').textContent, 'Confirm email');
  assert.equal(app.container.querySelector('button').disabled, false);
  assert.equal(app.calls.length, 0);
  assert.equal(app.clients.length, 0);
  assert.equal(app.openApp(), null);
  assert.ok(!app.container.innerHTML.includes(testToken));
});

test('explicit type=email confirmation verifies once and exposes only the supported app link on success', async (t) => {
  const app = await mount(t);
  await app.click();
  assert.equal(app.calls.length, 1);
  assert.deepEqual({ ...app.calls[0] }, { token_hash: testToken, type: 'email' });
  assert.equal(app.clients[0].key, 'test-only-publishable-key');
  assert.equal(app.clients[0].options.auth.persistSession, false);
  assert.equal(app.clients[0].options.auth.detectSessionInUrl, false);
  assert.equal(app.clients[0].options.auth.autoRefreshToken, false);
  assert.equal(app.container.querySelector('h1').textContent, 'Email verified!');
  assert.match(app.container.textContent, /Your ExploreWise account is ready\./);
  assert.equal(app.openApp().textContent, 'Open ExploreWise');
  assert.equal(window.location.protocol, 'https:');
  assert.equal(app.container.querySelector('button'), null);
  assert.ok(!app.container.innerHTML.includes(testToken));
  await app.render();
  assert.equal(app.calls.length, 1);
});

test('rapid clicks before React commits and clicks while pending cannot double-submit', async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const app = await mount(t, { verify: () => pending });
  const button = app.container.querySelector('button');
  await act(() => {
    button.click();
    // React has not yet rendered disabled=true. This exercises the ref guard.
    assert.equal(button.disabled, false);
    button.click();
    button.click();
  });
  assert.equal(app.calls.length, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Confirming…');
  assert.equal(app.openApp(), null);
  await app.render();
  await app.click();
  assert.equal(app.calls.length, 1);
  await act(() => resolve({ error: null }));
  button.click();
  await app.render();
  assert.equal(app.calls.length, 1);
  assert.equal(app.container.querySelector('h1').textContent, 'Email verified!');
});

test('Supabase token rejection shows expired/invalid only after confirmation', async (t) => {
  const app = await mount(t, { verify: async () => ({ error: { code: 'otp_expired', message: testToken } }) });
  assert.doesNotMatch(app.container.textContent, /expired or is invalid/);
  await app.click();
  assert.equal(app.container.querySelector('h1').textContent, 'This link has expired or is invalid.');
  assert.match(app.container.textContent, /Request a new verification email from the ExploreWise app and try again\./);
  assert.equal(app.openApp(), null);
  assert.equal(app.container.querySelector('button'), null);
  assert.ok(!app.container.innerHTML.includes(testToken));
  await app.render();
  assert.equal(app.calls.length, 1);
});

for (const query of ['type=email', 'token_hash=&type=email', 'token_hash=%20&type=email', `token_hash=${testToken}`, `token_hash=${testToken}&type=signup`, `token_hash=${testToken}&type=recovery`, `token_hash=${testToken}&type=unknown`, `token_hash=${testToken}&type=`]) {
  test(`incomplete or unsupported query fails safely: ${query.replace(testToken, '[fixture]')}`, async (t) => {
    const app = await mount(t, { query });
    assert.equal(app.container.querySelector('h1').textContent, 'This confirmation link is incomplete.');
    assert.equal(app.container.querySelector('button'), null);
    assert.equal(app.openApp(), null);
    assert.equal(app.clients.length, 0);
    assert.equal(app.calls.length, 0);
    assert.ok(!app.container.innerHTML.includes(testToken));
  });
}

test('missing configuration does not claim the token expired or call Supabase', async (t) => {
  const app = await mount(t, { configured: false });
  await app.click();
  assert.match(app.container.textContent, /We couldn’t confirm your email\./);
  assert.doesNotMatch(app.container.textContent, /expired or is invalid/);
  assert.equal(app.clients.length, 0);
  assert.equal(app.calls.length, 0);
  assert.equal(app.openApp(), null);
});

for (const verify of [
  async () => { throw new Error(testToken); },
  async () => ({ error: { code: 'over_request_rate_limit', message: testToken } }),
]) {
  test('network/service failures do not leak details, claim expiry or retry automatically', async (t) => {
    const app = await mount(t, { verify });
    await app.click();
    assert.match(app.container.textContent, /We couldn’t confirm your email\./);
    assert.doesNotMatch(app.container.textContent, /expired or is invalid/);
    assert.ok(!app.container.innerHTML.includes(testToken));
    assert.equal(app.openApp(), null);
    await app.render();
    assert.equal(app.calls.length, 1);
  });
}

test('a changed link starts ready and ignores the previous link’s pending result', async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const app = await mount(t, { verify: () => pending });
  await app.click();
  app.setQuery('token_hash=another-test-only-token&type=email');
  await app.render();
  await act(() => resolve({ error: null }));
  assert.equal(app.container.querySelector('button').textContent, 'Confirm email');
  assert.equal(app.openApp(), null);
  assert.equal(app.calls.length, 1);
});

test('email template uses RedirectTo and TokenHash with email confirmation type', () => {
  const template = readFileSync(new URL('../../../supabase/templates/confirm-signup.html', import.meta.url), 'utf8');
  assert.match(template, /href="\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&amp;type=email"/);
  assert.doesNotMatch(template, /localhost|href="explorewise:|\.ConfirmationURL|type=signup/);
});
