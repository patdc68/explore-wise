import type { Accent } from "@/data/site";

type CategoryCardProps = {
  accent: Accent;
  hint: string;
  index: number;
  label: string;
};

export function CategoryCard({
  accent,
  hint,
  index,
  label,
}: CategoryCardProps) {
  return (
    <article className={`category-card accent-${accent}`}>
      <span aria-hidden="true" className="category-number">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <h3>{label}</h3>
        <p>{hint}</p>
      </div>
      <span aria-hidden="true" className="category-arrow">
        ↗
      </span>
    </article>
  );
}
