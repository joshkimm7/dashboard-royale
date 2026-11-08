import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { cash, n } from '../lib/format.js';

function MoveTally({ label, count, total }) {
  return (
    <div className="move-result">
      <span className="tally">{n(count) + ' of ' + n(total)}</span>
      <span>{label}</span>
      <span className="blocks" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < count ? 'gain' : undefined} />)}
      </span>
    </div>
  );
}

/** The July recommendation hero. Always mounted (hidden off the Overview tab) so its entrance animation can replay. */
export default function Overview({ heroRef, hidden }) {
  const m = useModel();
  const nav = useNav();
  const { quietCohort, payoutCohort, payoutOverlap, shortCohort, moveCases } = m;
  const verdict = 'Of the ten lowest earners, ' + quietCohort.length + ' sit in quiet zones' +
    (payoutOverlap.length ? ', including ' + payoutOverlap.join(' and ') : '') +
    (payoutCohort.length === 1 && payoutOverlap.length === 1 ? ', the only payout flag.' : '. Payout flags: ' + (payoutCohort.map(r => r.id).join(', ') || 'none') + '.') +
    ' ' + shortCohort.length + ' (' + shortCohort.join(', ') + ') had under 60 days on the floor.';

  return (
    <section className="hero" id="overview" aria-labelledby="july-heading" ref={heroRef} hidden={hidden}>
      <div className="eyebrow">July 2025 recommendation</div>
      <h1 id="july-heading">Cancel the blanket replacement.</h1>
      <p>Inspect one cabinet for a payout issue and wait for stronger evidence before moving another. The July plan keeps <strong id="hero-reserve">{cash(m.reserve)}</strong> in reserve.</p>
      <p id="cohort-verdict" className="cohort-verdict">{verdict}</p>
      <div className="hero-links">
        <button className="hero-audit-link" data-evidence="M-5076" data-section="verdict-check" onClick={() => nav.openEvidence('M-5076', 'verdict-check')}>See the bottom-ten verdicts</button>
        <button className="hero-audit-link" data-goto="map" onClick={() => nav.goto('map')}>See how the evidence connects →</button>
      </div>
      <div id="decision-cards" className="decision-cards" aria-label="Recommended actions">
        <article className="decision-card">
          <span className="eyebrow">01 · Inspect M-1158</span>
          <strong className="decision-value">{cash(m.inspectionCost)}</strong>
          <p>{'A ' + cash(m.inspect.theo - m.inspect.win) + ' payout shortfall persisted across the audit.'}</p>
          <button data-evidence="M-1158" data-section="hold-check" onClick={() => nav.openEvidence('M-1158', 'hold-check')}>View payout evidence</button>
        </article>
        <article className="decision-card">
          <span className="eyebrow">02 · M-1181 relocation</span>
          <strong className="decision-value">Defer</strong>
          <p>All four destinations gained. Only two pairs gained overall.</p>
          <button data-jump="move-check" onClick={() => nav.jump('move-check')}>Compare the four moves</button>
        </article>
        <article className="decision-card">
          <span className="eyebrow">03 · Routine staffing</span>
          <strong className="decision-value">Flex coverage</strong>
          <p>{'Schedule extra coverage at ' + cash(m.peakThreshold) + ' in forecast wagers. Review events separately.'}</p>
          <button data-jump="staffing-check" onClick={() => nav.jump('staffing-check')}>See the staffing replay</button>
        </article>
      </div>
      <div id="move-proof" className="move-proof">
        <div><h2>Four historical moves</h2><p>Wagers relative to comparison banks · 14-day window</p></div>
        <MoveTally label="Moved cabinets improved" count={moveCases.filter(r => r.main.cabinet > 0).length} total={moveCases.length} />
        <MoveTally label="Bank pairs gained overall" count={moveCases.filter(r => r.main.bankPct > 0).length} total={moveCases.length} />
      </div>
    </section>
  );
}
