import type { ReactNode } from "react";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

type LegalPageProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

type LegalSectionProps = {
  children: ReactNode;
  title: string;
};

export function LegalPage({
  children,
  description,
  eyebrow,
  title,
}: LegalPageProps) {
  return (
    <>
      <Navigation />
      <main className="legal-main">
        <header className="legal-hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <p className="legal-updated">Last updated: August 31, 2026</p>
        </header>
        <article className="legal-card">{children}</article>
      </main>
      <Footer />
    </>
  );
}

export function LegalSection({ children, title }: LegalSectionProps) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
