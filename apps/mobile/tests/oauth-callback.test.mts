import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

import { createOAuthCallbackFlow, parseOAuthCallback, OAUTH_CALLBACK_ERROR } from '../src/services/oauth-callback.ts';
import * as callbackService from '../src/services/oauth-callback.ts';

const require = createRequire(import.meta.url);
const redirect = 'explorewise://auth/callback';
const fingerprint = async (value: string) => createHash('sha256').update(value).digest('hex');
const fixtureSession: any = { user: { id: 'TEST-user', user_metadata: {} }, access_token: 'TEST-access', refresh_token: 'TEST-refresh' };
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
function load(path: string, dependencies: Record<string, unknown>) {
  const exports: any = {};
  const compiled = ts.transpileModule(source(path), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', compiled)(exports, (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  });
  return exports;
}
function authStub() {
  const calls: any[] = [];
  return { calls, auth: {
    async getSession() { return { data: { session: fixtureSession }, error: null }; },
    async exchangeCodeForSession(code: string) { calls.push(['code', code]); return { data: { session: fixtureSession }, error: null }; },
    async setSession(tokens: any) { calls.push(['tokens', tokens]); return { data: { session: fixtureSession }, error: null }; },
  } as any };
}

test('authorization code is exchanged once, with precedence over tokens', async () => {
  const flow = createOAuthCallbackFlow(fingerprint); const { auth, calls } = authStub();
  const id = await flow.capture(`${redirect}?code=TEST-code#access_token=TEST-access&refresh_token=TEST-refresh`, redirect);
  assert.equal(await flow.complete(id, auth), fixtureSession);
  assert.deepEqual(calls, [['code', 'TEST-code']]);
});

for (const separator of ['?', '#']) {
  test(`implicit access/refresh tokens work in ${separator === '?' ? 'query' : 'fragment'}`, async () => {
    const flow = createOAuthCallbackFlow(fingerprint); const { auth, calls } = authStub();
    const id = await flow.capture(`${redirect}${separator}access_token=TEST-access&refresh_token=TEST-refresh`, redirect);
    assert.equal(await flow.complete(id, auth), fixtureSession);
    assert.deepEqual(calls, [['tokens', { access_token: 'TEST-access', refresh_token: 'TEST-refresh' }]]);
  });
}

for (const url of [
  'not a URL', `${redirect}?code=%ZZ`, `${redirect}?code=%E0%A4`, `${redirect}?code=%20`,
  `${redirect}?code=one&code=two`, `${redirect}?code=one#code=two`,
  `${redirect}-elsewhere?code=TEST-code`, 'https://untrusted.invalid/auth/callback?code=TEST-code',
  redirect, `${redirect}?unrelated=value`, `${redirect}#access_token=TEST-access`,
  `${redirect}#refresh_token=TEST-refresh`, `${redirect}?code=`,
  `${redirect}?error=access_denied&error_description=TEST-secret#access_token=TEST-access&refresh_token=TEST-refresh`,
]) {
  test(`rejects malformed, missing, or provider-error callback ${url.replace(/TEST-[\w-]+/g, 'fixture')}`, () => {
    assert.throws(() => parseOAuthCallback(url, redirect), { message: OAUTH_CALLBACK_ERROR });
  });
}

test('native intent and browser deliveries plus route remounts share one completion', async () => {
  const flow = createOAuthCallbackFlow(fingerprint); const { auth, calls } = authStub();
  const [nativeId, browserId] = await Promise.all([
    flow.capture(`${redirect}?code=TEST-code`, redirect),
    flow.capture('explorewise:///auth/callback#code=TEST-code', redirect),
  ]);
  assert.equal(nativeId, browserId);
  await Promise.all([flow.complete(nativeId, auth), flow.complete(browserId, auth)]);
  await flow.complete(nativeId, auth);
  assert.equal(calls.length, 1);
  assert.equal(flow.claimNavigation(nativeId), true);
  assert.equal(flow.claimNavigation(browserId), false);
});

test('exchange failures, thrown errors and empty sessions are sanitized and never retried with the same code', async () => {
  for (const result of [{ data: { session: null }, error: null }, { data: {}, error: { message: 'TEST-secret' } }, null]) {
    const flow = createOAuthCallbackFlow(fingerprint); let calls = 0;
    const id = await flow.capture(`${redirect}?code=TEST-code`, redirect);
    const auth: any = { exchangeCodeForSession: async () => { calls++; if (!result) throw new Error('TEST-secret'); return result; } };
    await assert.rejects(flow.complete(id, auth), { message: OAUTH_CALLBACK_ERROR });
    await assert.rejects(flow.complete(id, auth), { message: OAUTH_CALLBACK_ERROR });
    assert.equal(calls, 1);
  }
});

function googleModule() {
  return load('services/google-oauth.ts', {
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: (_algorithm: string, value: string) => fingerprint(value) },
    'expo-linking': { createURL: () => redirect }, './oauth-callback': callbackService,
  });
}

test('cold and warm native callback intents resolve to a real route with credentials stripped', async () => {
  const google = googleModule();
  const intent = load('app/+native-intent.tsx', { '@/services/google-oauth': google });
  assert.ok(existsSync(new URL('../src/app/auth/callback.tsx', import.meta.url)));
  assert.match(source('app/_layout.tsx'), /Stack.Screen name="auth\/callback"/);
  for (const initial of [true, false]) {
    const path = await intent.redirectSystemPath({ path: `${redirect}#access_token=TEST-access&refresh_token=TEST-refresh`, initial });
    assert.match(path, /^\/auth\/callback\?attempt=\d+$/);
    assert.doesNotMatch(path, /TEST-|token/);
    assert.equal(await intent.redirectSystemPath({ path: redirect, initial }), '/auth/callback?attempt=invalid');
    assert.equal(await intent.redirectSystemPath({ path: 'explorewise://place/TEST-place', initial }), 'explorewise://place/TEST-place');
  }
});

// Execute provider and screen hooks with host views stubbed, matching this repo's
// test approach. Effects run after render and can be flushed after async auth.
function hooks() {
  let cursor = 0;
  const slots: any[] = [];
  const pending: (() => void)[] = [];
  const cleanups: (() => void)[] = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useContext: () => null,
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: any) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn: () => any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn: any, deps: any[]) { return react.useMemo(() => fn, deps); },
    useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i][n])) { slots[i] = deps; pending.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  return { react, render(fn: () => any) { cursor = 0; const result = fn(); pending.splice(0).forEach((fn) => fn()); return result; }, cleanup() { cleanups.forEach((fn) => fn?.()); } };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

function providerHarness(browserResult: any = { type: 'cancel' }) {
  const runtime = hooks(); const google = googleModule(); const calls: any[] = [];
  let storedSession: any = null; let listener: any;
  const client = { auth: {
    getSession: async () => ({ data: { session: storedSession } }),
    onAuthStateChange: (fn: any) => { listener = fn; return { data: { subscription: { unsubscribe: () => calls.push(['unsubscribe']) } } }; },
    startAutoRefresh: () => {}, stopAutoRefresh: () => {},
    signInWithOAuth: async (options: any) => { calls.push(['oauth', options]); return { data: { url: 'https://TEST.invalid/authorize' }, error: null }; },
    setSession: async (tokens: any) => { calls.push(['tokens', tokens]); storedSession = fixtureSession; listener('SIGNED_IN', storedSession); return { data: { session: storedSession }, error: null }; },
    exchangeCodeForSession: async (code: string) => { calls.push(['code', code]); storedSession = fixtureSession; listener('SIGNED_IN', storedSession); return { data: { session: storedSession }, error: null }; },
    signInWithPassword: async (options: any) => { calls.push(['password', options]); return { error: null }; },
    signUp: async (options: any) => { calls.push(['signup', options]); return { data: { session: storedSession }, error: null }; },
  }, from: (table: string) => ({ upsert: async (profile: any, options: any) => { calls.push(['profile', table, profile, options]); } }) };
  const provider = load('providers/auth-provider.tsx', {
    react: runtime.react,
    'react-native': { AppState: { addEventListener: () => ({ remove: () => calls.push(['removeAppState']) }) } },
    'expo-router': { router: { navigate: (route: any) => calls.push(['navigate', route]) } },
    'expo-web-browser': { openAuthSessionAsync: async (...args: any[]) => { calls.push(['browser', ...args]); return browserResult; } },
    '@/lib/supabase': { getSupabaseClient: () => client, isSupabaseConfigured: true },
    '@/services/google-oauth': google, '@/services/oauth-callback': callbackService,
  });
  return { calls, google, client, cleanup: runtime.cleanup, render: () => runtime.render(() => provider.AuthProvider({ children: null })).props.value };
}

for (const type of ['cancel', 'dismiss']) {
  test(`cancelled browser auth (${type}) returns cleanly without session, error, or navigation`, async () => {
    const app = providerHarness({ type }); const auth = app.render(); await flush();
    assert.equal(await auth.signInWithGoogle(), 'cancelled');
    assert.equal(app.render().user, null);
    assert.equal(app.calls.filter(([name]) => ['code', 'tokens', 'navigate'].includes(name)).length, 0);
    app.cleanup();
    assert.ok(app.calls.some(([name]) => name === 'removeAppState'));
    assert.ok(app.calls.some(([name]) => name === 'unsubscribe'));
  });
}

test('browser only delivers a callback; completion updates AuthProvider and bootstraps the same user', async () => {
  const app = providerHarness({ type: 'success', url: `${redirect}#access_token=TEST-access&refresh_token=TEST-refresh` });
  const auth = app.render(); await flush();
  assert.equal(await auth.signInWithGoogle(), 'redirected');
  assert.equal(app.calls.filter(([name]) => name === 'tokens').length, 0);
  const route = app.calls.find(([name]) => name === 'navigate')[1];
  await auth.completeGoogleCallback(route.params.attempt);
  assert.equal(app.render().user.id, fixtureSession.user.id);
  assert.equal(app.render().session, fixtureSession);
  assert.equal((await app.client.auth.getSession()).data.session, fixtureSession);
  const profile = app.calls.find(([name]) => name === 'profile');
  assert.equal(profile[2].id, fixtureSession.user.id);
  assert.deepEqual(profile[3], { onConflict: 'id', ignoreDuplicates: true });
  app.cleanup();
});

test('email/password sign-in, signup trimming and email confirmation contract stay unchanged', async () => {
  const app = providerHarness(); const auth = app.render(); await flush();
  await auth.signIn(' test@example.invalid ', 'TEST-password');
  assert.deepEqual(app.calls.find(([name]) => name === 'password')[1], { email: 'test@example.invalid', password: 'TEST-password' });
  assert.deepEqual(await auth.signUp(' test@example.invalid ', 'TEST-password', ' Test Name '), { needsEmailConfirmation: true });
  assert.deepEqual(app.calls.find(([name]) => name === 'signup')[1], {
    email: 'test@example.invalid', password: 'TEST-password',
    options: { emailRedirectTo: 'https://explore-wise.fun/auth/confirm', data: { display_name: 'Test Name' } },
  });
  app.cleanup();
});

test('callback never logs tokens, even when the auth SDK throws token-bearing errors', async () => {
  const logs: any[] = []; const originals = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = (...args) => { logs.push(args); };
  try {
    const flow = createOAuthCallbackFlow(fingerprint);
    const id = await flow.capture(`${redirect}#access_token=TEST-access&refresh_token=TEST-refresh`, redirect);
    await assert.rejects(flow.complete(id, { setSession: async () => { throw new Error('TEST-access TEST-refresh'); } } as any), { message: OAUTH_CALLBACK_ERROR });
    assert.deepEqual(logs, []);
  } finally { [console.log, console.warn, console.error] = originals; }
});

test('actual Supabase client persists the implicit session and restores it in a new client', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  const encode = (value: any) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const access = `${encode({ alg: 'HS256' })}.${encode({ sub: 'TEST-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.TEST-signature`;
  const options = { auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async () => new Response(JSON.stringify(fixtureSession.user), { status: 200, headers: { 'Content-Type': 'application/json' } }) } };
  const client = createClient('https://test-fixture.supabase.co', 'TEST-publishable-key', options);
  const flow = createOAuthCallbackFlow(fingerprint);
  const id = await flow.capture(`${redirect}#access_token=${access}&refresh_token=TEST-refresh`, redirect);
  await flow.complete(id, client.auth);
  const restored = createClient('https://test-fixture.supabase.co', 'TEST-publishable-key', options);
  const { data } = await restored.auth.getSession();
  assert.equal(data.session.user.id, 'TEST-user');
  assert.equal(data.session.refresh_token, 'TEST-refresh');
  assert.ok([...saved.values()].every((value) => !value.includes(redirect)));
  assert.match(source('lib/supabase.ts'), /persistSession: true/);
  assert.match(source('lib/supabase.ts'), /: AsyncStorage/);
});

test('late duplicate callback cannot restore a cached session after sign-out', async () => {
  const flow = createOAuthCallbackFlow(fingerprint); const { auth, calls } = authStub();
  const id = await flow.capture(`${redirect}?code=TEST-code`, redirect);
  await flow.complete(id, auth);
  auth.getSession = async () => ({ data: { session: null }, error: null });
  await assert.rejects(flow.complete(id, auth), { message: OAUTH_CALLBACK_ERROR });
  assert.equal(calls.length, 1);
});

function routeHarness(auth: any, google: any, attempt: string | undefined, routes = ['(tabs)', 'auth/sign-in', 'auth/callback'], mode = 'light') {
  const runtime = hooks(); const calls: any[] = [];
  const router = { dismiss: (count: number) => calls.push(['dismiss', count]), replace: (path: string) => calls.push(['replace', path]) };
  const navigation = { getState: () => ({ index: routes.length - 1, routes: routes.map((name) => ({ name })) }) };
  const screen = load('app/auth/callback.tsx', {
    react: runtime.react,
    'expo-router': { useLocalSearchParams: () => ({ attempt }), useRouter: () => router, useNavigation: () => navigation },
    'react-native': { View: 'View', ActivityIndicator: 'Spinner', Alert: { alert: (...args: any[]) => calls.push(['alert', ...args]) }, StyleSheet: { create: (styles: any) => styles } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/ui/clay': { ClaySurface: 'Surface', PrimaryButton: 'Primary', SecondaryButton: 'Secondary' },
    '@/constants/theme': { MaxContentWidth: 600, Spacing: { md: 16 } },
    '@/hooks/use-theme': { useTheme: () => ({ background: mode, error: 'themed-error', accent: 'themed-accent' }) },
    '@/providers/auth-provider': { useAuth: () => auth },
    '@/services/google-oauth': google, '@/services/oauth-callback': callbackService,
  });
  return { calls, render: () => runtime.render(() => screen.default()), cleanup: runtime.cleanup };
}
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test('callback waits for provider state, dismisses auth screens, then runs queued contribution once', async () => {
  const google = googleModule(); const { auth: client } = authStub();
  const attempt = await google.googleOAuth.capture(`${redirect}?code=TEST-code`, redirect);
  const auth: any = { user: null, initializing: false, completeGoogleCallback: () => google.googleOAuth.complete(attempt, client) };
  const app = routeHarness(auth, google, attempt);
  auth.completeQueuedAction = async () => { app.calls.push(['queued contribution']); };
  app.render(); await flush(); app.render();
  assert.deepEqual(app.calls, []);
  auth.user = fixtureSession.user;
  app.render(); app.render();
  assert.deepEqual(app.calls, [['dismiss', 2], ['queued contribution']]);
  app.cleanup();
  const remount = routeHarness(auth, google, attempt, ['(tabs)', 'place/[id]/report', 'auth/callback']);
  remount.render(); await flush(); remount.render();
  assert.deepEqual(remount.calls, [['dismiss', 1]]);
  assert.equal(app.calls.filter(([name]) => name === 'queued contribution').length, 1);
});

test('cold callback with no navigation history returns to Profile', async () => {
  const google = googleModule(); const { auth: client } = authStub();
  const attempt = await google.googleOAuth.capture(`${redirect}?code=TEST-code`, redirect);
  const auth = { user: fixtureSession.user, initializing: false, completeGoogleCallback: () => google.googleOAuth.complete(attempt, client), completeQueuedAction: async () => {} };
  const app = routeHarness(auth, google, attempt, ['auth/callback']);
  app.render(); await flush(); app.render();
  assert.deepEqual(app.calls, [['replace', '/(tabs)/profile']]);
});

for (const mode of ['light', 'dark']) {
  test(`${mode} callback errors render only safe text with working Retry and Back actions`, async () => {
    const auth = { user: null, initializing: false, completeGoogleCallback: async () => { throw new Error('TEST-access TEST-refresh'); }, completeQueuedAction: async () => {} };
    const app = routeHarness(auth, googleModule(), 'invalid', undefined, mode);
    app.render(); await flush(); const tree = app.render();
    assert.doesNotMatch(JSON.stringify(tree), /TEST-access|TEST-refresh|Unmatched/);
    assert.ok(nodes(tree).some((node) => node.props?.children === OAUTH_CALLBACK_ERROR));
    assert.equal(tree.props.style[1].backgroundColor, mode);
    nodes(tree).find((node) => node.props?.label === 'Retry').props.onPress();
    nodes(tree).find((node) => node.props?.label === 'Back to Profile').props.onPress();
    assert.deepEqual(app.calls, [['replace', '/auth/sign-in'], ['replace', '/(tabs)/profile']]);
  });
}
