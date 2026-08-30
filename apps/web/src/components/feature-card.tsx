import type { Accent } from "@/data/site";

type FeatureCardProps = {
  accent?: Accent;
  description: string;
  eyebrow?: string;
  title: string;
};

export function FeatureCard({
  accent = "lime",
  description,
  eyebrow,
  title,
}: FeatureCardProps) {
  return (
    <article className={`clay-card feature-card accent-${accent}`}>
      <span aria-hidden="true" className="feature-orb" />
      {eyebrow ? <p className="card-eyebrow">{eyebrow}</p> : null}
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
