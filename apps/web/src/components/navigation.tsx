import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { navigationItems } from "@/data/site";

export function Navigation() {
  return (
    <header className="site-header">
      <nav aria-label="Primary navigation" className="nav-shell">
        <Link className="brand-link" href="/" aria-label="ExploreWise home">
          <BrandMark className="size-10 shrink-0" title="" />
          <span>ExploreWise</span>
        </Link>

        <div className="desktop-nav">
          {navigationItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </div>

        <Link className="button button-dark desktop-cta" href="/#coming-soon">
          Coming soon
        </Link>

        <details className="mobile-menu">
          <summary aria-label="Open navigation menu">
            <span>Menu</span>
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </summary>
          <div className="mobile-menu-panel">
            {navigationItems.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
            <Link className="button button-primary" href="/#coming-soon">
              Coming soon
            </Link>
          </div>
        </details>
      </nav>
    </header>
  );
}
