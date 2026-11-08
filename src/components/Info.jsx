// The "i" icon: hover, keyboard focus or tap shows a short plain-language explanation of a statistic.
import { useId, useRef, useState } from 'react';
import { CARD_INFO, CHART_INFO, DECISION_INFO, LINE_INFO, PANEL_INFO } from '../lib/info.js';

const MAPS = { card: CARD_INFO, line: LINE_INFO, panel: PANEL_INFO, chart: CHART_INFO, decision: DECISION_INFO };

/** Looks up the explanation for a label; dynamic titles like "Machine file · M-1158" fall back to their stem. */
export function infoFor(kind, label) {
  if (typeof label !== 'string') return null;
  const map = MAPS[kind] ?? {};
  return map[label] ?? map[label.split(' · ')[0]] ?? null;
}

export function Info({ text, label }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState('');
  const ref = useRef(null);
  const id = useId();
  if (!text) return null;

  // Keep the bubble on screen: flip below near the top, anchor to the nearer side near an edge.
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const cls = [];
      if (r.top < 150) cls.push('below');
      if (r.left < 160) cls.push('edge-left');
      else if (innerWidth - r.right < 160) cls.push('edge-right');
      setPlace(cls.join(' '));
    }
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <span ref={ref} className={'info ' + place + (open ? ' open' : '')} onMouseEnter={show} onMouseLeave={hide}>
      <button type="button" className="info-btn" aria-label={'About ' + (label ?? 'this statistic')} aria-describedby={id} aria-expanded={open}
        onFocus={show} onBlur={hide} onClick={e => { e.stopPropagation(); open ? hide() : show(); }}
        onKeyDown={e => { if (e.key === 'Escape') hide(); }}>i</button>
      <span role="tooltip" id={id} className="info-tip">{text}</span>
    </span>
  );
}

/** Convenience: an Info icon for a known label, or nothing when no explanation exists. */
export const InfoFor = ({ kind, label }) => <Info text={infoFor(kind, label)} label={label} />;
