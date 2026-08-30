import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Contact ExploreWise for general questions, technical issues, business inquiries, or privacy requests.",
};

const supportOptions = [
  {
    title: "General questions",
    description:
      "Curious about ExploreWise, the Metro Manila launch, or what we are building?",
    email: "developer@explore-wise.fun",
    label: "Ask a question",
  },
  {
    title: "Technical issues",
    description:
      "Found something broken on this website or need to report a development-stage issue?",
    email: "support@explore-wise.fun",
    label: "Report an issue",
  },
  {
    title: "Business inquiries",
    description:
      "Interested in future data, venue, merchant, or ecosystem partnerships?",
    email: "business@explore-wise.fun",
    label: "Discuss a partnership",
  },
  {
    title: "Privacy requests",
    description:
      "Have a question about personal information or want to make a privacy-related request?",
    email: "developer@explore-wise.fun",
    label: "Make a privacy request",
  },
] as const;

export default function SupportPage() {
  return (
    <>
      <Navigation />
      <main className="support-main">
        <header className="support-hero">
          <p className="eyebrow">Support and contact</p>
          <h1>How can we help?</h1>
          <p>
            ExploreWise is still in development, but the people building it are
            already here. Choose the most relevant contact below.
          </p>
        </header>

        <div className="support-grid">
          {supportOptions.map((option, index) => (
            <article className="support-card clay-card" key={option.title}>
              <span className="support-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              <a
                className="support-link"
                href={`mailto:${option.email}?subject=ExploreWise%20-%20${encodeURIComponent(option.title)}`}
              >
                {option.label}
                <span aria-hidden="true">↗</span>
              </a>
              <small>{option.email}</small>
            </article>
          ))}
        </div>

        <section className="support-note">
          <div>
            <p className="eyebrow">Good to know</p>
            <h2>No ticket maze.</h2>
          </div>
          <p>
            These addresses open your email app. This website does not collect
            or process support messages itself, and response times are not yet
            guaranteed while ExploreWise is in development.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
