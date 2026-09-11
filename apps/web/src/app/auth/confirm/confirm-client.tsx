'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useRef, useState } from 'react';

type Status = 'ready' | 'confirming' | 'success' | 'invalid' | 'unavailable';
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export function ConfirmClient() {
  const params = useSearchParams();
  const tokenHash = params.get('token_hash');
  const type = params.get('type');

  // A different link gets fresh presentation state, without a verification effect.
  return <Confirmation key={JSON.stringify([tokenHash, type])} tokenHash={tokenHash} type={type} />;
}

function Confirmation({ tokenHash, type }: { tokenHash: string | null; type: string | null }) {
  const [status, setStatus] = useState<Status>('ready');
  const submitted = useRef(false);
  const missing = !tokenHash?.trim() || type !== 'signup';

  async function confirmEmail() {
    if (missing || !tokenHash || submitted.current) return;

    // Lock synchronously, before React renders or any asynchronous work begins.
    // Keep the lock after completion: this one-time token must not be resubmitted.
    submitted.current = true;
    if (!projectUrl || !publishableKey) {
      setStatus('unavailable');
      return;
    }

    setStatus('confirming');
    try {
      const supabase = createClient(projectUrl, publishableKey, {
        auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false },
      });
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' });
      setStatus(!error ? 'success' : error.code === 'otp_expired' ? 'invalid' : 'unavailable');
    } catch {
      // Do not log errors or expose request details containing the token.
      setStatus('unavailable');
    }
  }

  const content = missing
    ? ['This confirmation link is incomplete.', 'Request a new verification email from the ExploreWise app, then use its newest link.']
    : status === 'success'
      ? ['Email verified!', 'Your ExploreWise account is ready.']
      : status === 'invalid'
        ? ['This link has expired or is invalid.', 'Request a new verification email from the ExploreWise app and try again.']
        : status === 'unavailable'
          ? ['We couldn’t confirm your email.', 'Check your account in the ExploreWise app. If it still needs confirmation, request a new verification email and try again.']
          : ['Confirm your email', "You're almost there. Confirm this email address to finish creating your ExploreWise account."];

  return (
    <main className="confirm-main">
      <section className="confirm-card clay-card" aria-live="polite" aria-busy={status === 'confirming'}>
        <span className="confirm-mark">⌖</span>
        <p className="eyebrow">ExploreWise</p>
        <h1>{content[0]}</h1>
        <p>{content[1]}</p>
        {!missing && (status === 'ready' || status === 'confirming') ? (
          <button className="button button-primary" type="button" disabled={status === 'confirming'} onClick={confirmEmail}>
            {status === 'confirming' ? 'Confirming…' : 'Confirm email'}
          </button>
        ) : null}
        {!missing && status === 'success' ? (
          <a className="button button-primary" href="explorewise://auth/callback">Open ExploreWise</a>
        ) : null}
        <Link className="confirm-link" href="/">Back to ExploreWise</Link>
        <small>ExploreWise · Inventra Systems</small>
      </section>
    </main>
  );
}
