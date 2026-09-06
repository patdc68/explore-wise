'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

type Status = 'checking' | 'success' | 'invalid' | 'missing';
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export function ConfirmClient() { const params = useSearchParams(); const [status, setStatus] = useState<Status>('checking'); useEffect(() => { const tokenHash = params.get('token_hash'); const type = params.get('type'); if (!tokenHash || type !== 'email') { setStatus('missing'); return; } if (!projectUrl || !publishableKey) { setStatus('invalid'); return; } void createClient(projectUrl, publishableKey, { auth: { persistSession: false, detectSessionInUrl: false } }).auth.verifyOtp({ token_hash: tokenHash, type: 'email' }).then(({ error }) => setStatus(error ? 'invalid' : 'success')); }, [params]); const content = status === 'checking' ? ['Checking your email link', 'Just a moment while we verify your account.'] : status === 'success' ? ['Email verified!', 'Your ExploreWise account is ready.'] : status === 'missing' ? ['This confirmation link is incomplete.', 'Request a new verification email from the ExploreWise app, then use its newest link.'] : ['This link has expired or is invalid.', 'Request a new verification email from the ExploreWise app and try again.']; return <main className="confirm-main"><section className="confirm-card clay-card"><span className="confirm-mark">⌖</span><p className="eyebrow">ExploreWise</p><h1>{content[0]}</h1><p>{content[1]}</p>{status === 'success' ? <a className="button button-primary" href="explorewise://auth/callback">Open ExploreWise</a> : null}<Link className="confirm-link" href="/">Back to ExploreWise</Link><small>ExploreWise · Inventra Systems</small></section></main>; }
