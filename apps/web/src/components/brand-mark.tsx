type BrandMarkProps = {
  className?: string;
  title?: string;
};

export function BrandMark({
  className = "size-10",
  title = "ExploreWise",
}: BrandMarkProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect fill="currentColor" height="48" rx="15" width="48" />
      <path
        d="M24 9.5c-7.46 0-13.5 5.91-13.5 13.21 0 9.12 10.53 15.4 12.82 16.66a1.4 1.4 0 0 0 1.36 0C26.97 38.1 37.5 31.83 37.5 22.71 37.5 15.41 31.46 9.5 24 9.5Z"
        fill="var(--color-lime)"
      />
      <circle cx="24" cy="22.5" fill="var(--color-ink)" r="6.5" />
      <path
        d="m27.55 18.95-1.83 5.12a2.55 2.55 0 0 1-1.54 1.54l-5.12 1.83 1.83-5.12a2.55 2.55 0 0 1 1.54-1.54l5.12-1.83Z"
        fill="var(--color-surface)"
      />
    </svg>
  );
}
