interface MerchantSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function MerchantSearchInput({
  value,
  onChange,
  placeholder = "搜尋商戶編號、名稱或系統 ID…",
  ariaLabel = "搜尋商戶",
}: MerchantSearchInputProps) {
  return (
    <div className="merchant-search-wrap">
      <input
        type="search"
        className="merchant-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
      <svg
        className="merchant-search-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4.2-4.2" />
      </svg>
    </div>
  );
}
