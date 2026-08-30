import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-shell">
        <div className="footer-brand">
          <Link className="brand-link" href="/" aria-label="ExploreWise home">
            <BrandMark className="size-10 shrink-0" title="" />
            <span>ExploreWise</span>
          </Link>
          <p>
            Thoughtful discovery for real budgets, real time, and real life.
          </p>
          <p className="footer-company">An Inventra Systems product.</p>
        </div>

        <div className="footer-links">
          <div>
            <p className="footer-label">Explore</p>
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/#discover">Discover</Link>
            <Link href="/#faq">FAQ</Link>
          </div>
          <div>
            <p className="footer-label">Information</p>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/support">Support</Link>
          </div>
          <div>
            <p className="footer-label">Contact</p>
            <a href="mailto:developer@explore-wise.fun">
              developer@explore-wise.fun
            </a>
            <a href="https://explore-wise.fun">explore-wise.fun</a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {currentYear} Inventra Systems. All rights reserved.</p>
        <p>Starting in Metro Manila. Built for anywhere.</p>
      </div>
    </footer>
  );
}
