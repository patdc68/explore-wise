import type { ReactNode } from "react";

type SectionProps = {
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  id?: string;
  title?: string;
};

export function Section({
  children,
  className = "",
  description,
  eyebrow,
  id,
  title,
}: SectionProps) {
  return (
    <section className={`section-shell ${className}`} id={id}>
      {eyebrow || title || description ? (
        <div className="section-heading">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
