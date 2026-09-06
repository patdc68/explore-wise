import { Suspense } from 'react';
import { ConfirmClient } from './confirm-client';
export default function ConfirmEmailPage() { return <Suspense fallback={<main className="confirm-main"><section className="confirm-card clay-card"><p className="eyebrow">ExploreWise</p><h1>Checking your email link</h1></section></main>}><ConfirmClient /></Suspense>; }
