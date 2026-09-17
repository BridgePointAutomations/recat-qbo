// Tag checkbox popup for a queue row — port of Recat.dc.html lines 268–278
// (desktop, with 'Manage tags →' footer) and 337–343 (mobile, no footer).

import type { KeyboardEvent, MouseEvent } from 'react';
import { useRef } from 'react';
import type { TagDto } from '@recat/shared';

const stop = (e: MouseEvent) => e.stopPropagation();

export default function TagPicker({
  tags,
  selectedIds,
  onToggle,
  onManage,
  onClose,
  width,
}: {
  tags: TagDto[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  /** 'Manage tags →' footer (desktop only in the prototype). */
  onManage?: () => void;
  /** Escape closes the popup, matching SelectCombobox's keyboard pattern. */
  onClose?: () => void;
  /** 230 on desktop, 'min(230px,86vw)' on mobile. */
  width: string | number;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <span
      ref={rootRef}
      onClick={stop}
      onMouseDown={stop}
      onKeyDown={onKeyDown}
      style={{
        position: 'absolute',
        zIndex: 16,
        top: 'calc(100% + 6px)',
        left: 0,
        width,
        background: 'var(--card)',
        border: '1px solid var(--bd)',
        borderRadius: 9,
        boxShadow: 'var(--sh)',
        display: 'block',
        overflow: 'hidden',
      }}
    >
      {tags.map((tag) => (
        <button
          key={tag.id}
          aria-pressed={selectedIds.includes(tag.id)}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(tag.id);
          }}
          className="hov-hl"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            width: '100%',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '9px 13px',
            font: 'inherit',
            fontSize: 13.5,
            color: 'var(--ink)',
            textAlign: 'left',
          }}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(tag.id)}
            readOnly
            style={{ width: 14, height: 14, accentColor: 'var(--acc)', pointerEvents: 'none' }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: tag.color,
              display: 'inline-block',
            }}
          />
          {tag.name}
        </button>
      ))}
      {onManage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManage();
          }}
          className="hov-hl"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 'none',
            borderTop: '1px solid var(--bd2)',
            background: 'none',
            padding: '9px 13px',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--acc)',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          Manage tags →
        </button>
      )}
    </span>
  );
}
