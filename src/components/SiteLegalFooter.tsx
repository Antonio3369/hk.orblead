import { LEGAL_FILING } from "@/config/branding";

interface SiteLegalFooterProps {
  className?: string;
}

export function SiteLegalFooter({ className }: SiteLegalFooterProps) {
  const classes = ["site-legal-footer", className].filter(Boolean).join(" ");

  return (
    <footer className={classes} aria-label="备案信息">
      <a href={LEGAL_FILING.icpUrl} target="_blank" rel="noopener noreferrer">
        {LEGAL_FILING.icpNumber}
      </a>
      <span className="site-legal-footer__sep" aria-hidden>
        |
      </span>
      <a href={LEGAL_FILING.psUrl} target="_blank" rel="noopener noreferrer">
        {LEGAL_FILING.psLabel}
      </a>
    </footer>
  );
}
