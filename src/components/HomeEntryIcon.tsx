import type { ReactNode } from "react";

export type HomeEntryIconKind =
  | "alerts"
  | "merchants"
  | "failures"
  | "tiger"
  | "team"
  | "summary"
  | "mastercard"
  | "overseasCard"
  | "developer";
export type HomeEntryIconTone = "amber" | "blue" | "rose" | "green" | "violet";

const paths: Record<HomeEntryIconKind, ReactNode> = {
  alerts: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </>
  ),
  merchants: (
    <>
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
      <path d="M3 9 12 3l9 6" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  failures: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  tiger: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  team: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  summary: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
    </>
  ),
  mastercard: (
    <>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </>
  ),
  overseasCard: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M2 12h20" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  developer: (
    <>
      <path d="M16 18 22 12 16 6" />
      <path d="M8 6 2 12l6 6" />
    </>
  ),
};

export function HomeEntryIconSvg({
  kind,
  className = "",
}: {
  kind: HomeEntryIconKind;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      {paths[kind]}
    </svg>
  );
}

export function HomeEntryIcon({ kind, tone }: { kind: HomeEntryIconKind; tone: HomeEntryIconTone }) {
  return (
    <div className={`home-entry-icon home-entry-icon--${tone}`} aria-hidden>
      <HomeEntryIconSvg kind={kind} />
    </div>
  );
}
