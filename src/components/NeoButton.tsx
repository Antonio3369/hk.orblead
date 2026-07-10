import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type NeoSize = "md" | "sm" | "xs";

interface NeoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: NeoSize;
  /** 選中態（分頁、篩選） */
  active?: boolean;
}

function neoClass(size: NeoSize, extra = "") {
  return `neo-button neo-button--${size}${extra ? ` ${extra}` : ""}`;
}

export function NeoButton({
  children,
  size = "md",
  active = false,
  className = "",
  type = "button",
  ...rest
}: NeoButtonProps) {
  return (
    <button
      type={type}
      className={`${neoClass(size, className)}${active ? " neo-button--active" : ""}`}
      {...rest}
    >
      <div>
        <span>{children}</span>
      </div>
    </button>
  );
}

interface NeoPillProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  size?: NeoSize;
}

/** 僅展示、不可點擊（如頂部用戶名） */
export function NeoPill({ children, size = "sm", className = "", ...rest }: NeoPillProps) {
  return (
    <span className={`${neoClass(size, className)} neo-button--static`} {...rest}>
      <div>
        <span>{children}</span>
      </div>
    </span>
  );
}
