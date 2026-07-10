import { useMemo, useState } from "react";
import {
  HomeEntryIcon,
  HomeEntryIconSvg,
  type HomeEntryIconKind,
  type HomeEntryIconTone,
} from "@/components/HomeEntryIcon";
import type { ReactNode } from "react";

export interface HomeEntryItem {
  key: string;
  iconKind: HomeEntryIconKind;
  iconTone: HomeEntryIconTone;
  cardClassName: string;
  title: string;
  description: string;
  footer: ReactNode;
  packQuantity: string;
  packLabel: string;
  unreadDot?: boolean;
  onSelect: () => void;
}

interface HomeEntryPackProps {
  entries: HomeEntryItem[];
}

const PACK_SLOTS = 4;
const POP_MS = 420;

function HomeEntryCard({ item }: { item: HomeEntryItem }) {
  return (
    <button type="button" className={item.cardClassName} onClick={item.onSelect}>
      <HomeEntryIcon kind={item.iconKind} tone={item.iconTone} />
      {item.unreadDot && <span className="home-entry-unread-dot" />}
      <div className="home-entry-body">
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        {item.footer}
      </div>
      <span className="home-entry-arrow">→</span>
    </button>
  );
}

function EntryPackGrid({
  entries,
  poppingKey,
  onSelectItem,
}: {
  entries: HomeEntryItem[];
  poppingKey: string | null;
  onSelectItem: (item: HomeEntryItem) => void;
}) {
  const slots = useMemo(
    () => Array.from({ length: PACK_SLOTS }, (_, index) => entries[index] ?? null),
    [entries]
  );

  return (
    <div className="home-entry-pack-card">
      {slots.map((item, index) => {
        const slot = index + 1;
        if (!item) {
          return (
            <div
              key={`empty-${slot}`}
              className={`home-entry-pack-card__item home-entry-pack-card__item--${slot} home-entry-pack-card__item--empty`}
              aria-hidden
            />
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            className={`home-entry-pack-card__item home-entry-pack-card__item--${slot}${poppingKey === item.key ? " home-entry-pack-card__item--pop" : ""}`}
            aria-label={item.title}
            disabled={poppingKey != null}
            onClick={() => onSelectItem(item)}
          >
            <HomeEntryIconSvg kind={item.iconKind} className="home-entry-pack-card__icon" />
            <span className="home-entry-pack-card__quantity">{item.packQuantity}</span>
            <span className={`home-entry-pack-card__text home-entry-pack-card__text--${slot}`}>
              {item.packLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HomeEntryPack({ entries }: HomeEntryPackProps) {
  const [poppingKey, setPoppingKey] = useState<string | null>(null);

  const packHint = useMemo(() => {
    const unread = entries.filter((e) => e.unreadDot).length;
    const countLabel = `${entries.length} 個功能`;
    if (unread > 0) return `${countLabel} · ${unread} 項有待處理`;
    return countLabel;
  }, [entries]);

  const selectEntry = (item: HomeEntryItem) => {
    if (poppingKey) return;
    setPoppingKey(item.key);
    window.setTimeout(() => {
      item.onSelect();
    }, POP_MS);
  };

  return (
    <>
      <section
        className={`home-entry-grid home-entry-section--wide${entries.length >= 4 ? " home-entry-grid--admin" : ""}`}
      >
        {entries.map((item) => (
          <HomeEntryCard key={item.key} item={item} />
        ))}
      </section>

      <section className="home-entry-pack home-entry-section--compact" aria-label="業務卡包">
        <div className="home-entry-pack__meta">
          <span className="home-entry-pack__label">業務卡包</span>
          <span className="home-entry-pack__hint">{packHint}</span>
        </div>
        <EntryPackGrid entries={entries} poppingKey={poppingKey} onSelectItem={selectEntry} />
        <p className="home-entry-pack__action">點選方格進入功能</p>
      </section>
    </>
  );
}
