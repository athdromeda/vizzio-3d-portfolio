import { useEffect, useRef } from 'react';

interface Props {
  /** The visitor approved the swap. */
  onConfirm: () => void;
  /** The visitor stayed in the air. */
  onCancel: () => void;
  /** The simplified city is building. */
  loading: boolean;
}

/** Blocking confirm shown before the pilot leaves the real tiles for the simplified city. */
export function LandConfirm({ onConfirm, onCancel, loading }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <div
      className="land-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="land-title"
      onKeyDown={(e) => {
        if (loading) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm();
        }
      }}
    >
      <div className="land-confirm__panel" ref={panel} tabIndex={-1}>
        <p className="eyebrow">Landing</p>
        <h2 id="land-title">Leave the photorealistic tiles?</h2>
        <p>
          On the ground the city reloads as a simplified 3D model — buildings, streets and traffic generated in code,
          not Google&apos;s photorealistic tiles. Taking off again brings the real tiles back.
        </p>
        <div className="land-confirm__actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={loading}>
            Keep flying
          </button>
          <button type="button" className="cta" onClick={onConfirm} disabled={loading}>
            {loading ? 'Loading simplified city…' : 'Land here'}
          </button>
        </div>
        <p className="land-confirm__hint">Enter lands · Esc stays in the air</p>
      </div>
    </div>
  );
}
