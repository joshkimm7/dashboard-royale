import { useEffect, useRef, useState } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { InfoFor } from '../components/Info.jsx';
import { Card, Details, How, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { cash, n, pct, pp, ratio, signedPct, sum } from '../lib/format.js';
import { BUDGET, MAX_TYPES, SENSITIVITY } from '../lib/plan.js';

function MoveSensitivity() {
  const { netMove, moveBreakEven } = useModel();
  const displacement = [0, .10, .25, .50];
  const capture = [.25, .50, .75];
  return (
    <>
      <Note>July net expected win from the move after its cost, three hours of disruption and displaced play. <b>Displaced</b> = share of the gain lost elsewhere on the floor.</Note>
      <Table headers={['Placement gap captured', ...displacement.map(x => pct(x, 0) + ' displaced')]} rows={capture.map(x => [pct(x, 0), ...displacement.map(d => cash(netMove(x, d)))])} />
      <Line label="Break-even placement capture at 0% / 25% displacement" value={pct(moveBreakEven, 0) + ' / ' + pct(moveBreakEven / .75, 0)} />
      <Note>Scenarios built from June same-configuration rates. Past moves show why capture and displacement are uncertain.</Note>
    </>
  );
}

/** Deep link from a July recommendation to its row on the Claims & evidence page. */
function TraceClaim({ id }) {
  const nav = useNav();
  return <button className="trace-claim" data-claim={id} onClick={() => nav.jump(id)}>Trace the claim →</button>;
}

/** A signed result: color plus an arrow and an explicit sign, so the direction never relies on color alone. */
function Metric({ label, value, format }) {
  const text = format(value), signedText = value > 0 && !/^\+/.test(text) ? '+' + text : text;
  return <div><dt>{label}</dt><dd className={value < 0 ? 'red' : value > 0 ? 'green' : ''}>{value < 0 || value > 0 ? <span aria-hidden="true">{value > 0 ? '▲ ' : '▼ '}</span> : null}{signedText}</dd></div>;
}

function Moves() {
  const { data, closestCase, bankZone, zones } = useModel();
  const cases = data.moves.filter(m => m.main);
  const positive = cases.filter(m => m.main.bankPct > 0).length;
  const cabinetGains = cases.filter(m => m.main.cabinet > 0).length;
  const destinationGains = cases.filter(m => m.main.targetChange > 0).length;
  const signedCash = value => value > 0 ? '+' + cash(value) : cash(value);
  const detailsRows = cases.map(({ id, date, main: m, short }) => [id, date, m.origin + ' → ' + m.target, n(m.controls),
    cash(m.pre) + ' → ' + cash(m.post), signedPct(m.pretrend), signedPct(m.cabinet), signedPct(short?.cabinet),
    cash(m.originChange), cash(m.targetChange), cash(m.bankChange), signedPct(m.bankPct), signedPct(short?.bankPct)]);
  return (
    <Panel title="What happened after past moves?" id="move-check">
      <Takeaway>{destinationGains + ' of ' + cases.length + ' destination banks gained. ' + cabinetGains + ' moved cabinets improved, and only ' + positive + ' bank pairs gained overall.'}</Takeaway>
      <Note>{'14 days before vs after, relative to comparison cabinets and banks. The closest route to the proposed move (' + zones[bankZone[closestCase.main.origin]] + ' → ' + zones[bankZone[closestCase.main.target]] + ') ' +
        (closestCase.main.bankPct >= 0 ? 'gained ' : 'changed ') + pct(closestCase.main.bankPct) + ' across both banks' + (closestCase.main.pretrend > 0 ? ', but that cabinet was already improving before the move.' : '.')}</Note>
      <div className="move-cases" aria-label="Four historical relocations">
        {cases.map(({ id, main: m }) => (
          <article key={id} className="move-result-card">
            <h3>{id + ' · ' + m.origin + ' → ' + m.target}</h3>
            <dl>
              <Metric label="Moved cabinet · wagers per available hour" value={m.cabinet} format={signedPct} />
              <Metric label="Source bank · wagers per day" value={m.originChange} format={signedCash} />
              <Metric label="Destination bank · wagers per day" value={m.targetChange} format={signedCash} />
              <Metric label="Both banks · wagers per day" value={m.bankChange} format={v => signedCash(v) + ' (' + signedPct(m.bankPct) + ')'} />
            </dl>
          </article>
        ))}
      </div>
      <details>
        <summary>Full results and pre-move trends</summary>
        <Table headers={['Machine', 'Move date', 'Bank route', 'Cabinet peers', 'Coin-in/hr before → after', 'Pre-move relative trend', 'Cabinet change · 14d', 'Cabinet change · 7d', 'Source $/day', 'Destination $/day', 'Pair $/day', 'Pair change · 14d', 'Pair change · 7d']} rows={detailsRows} />
      </details>
      <Details title="Comparison design and limitations">Exclude the move day. Compare 14 days before and after against same-configuration cabinets that stayed at the same slot with complete coverage outside the affected banks. Cabinet change is the before/after ratio divided by the controls’ before/after ratio, minus one. The pre-move trend compares the two preceding seven-day blocks the same way. For each bank, subtract expected daily wagers using its pre-move wagers scaled by the before/after change of other banks in its zone. Combine the two differences and divide by their pre-move daily wagers for the pair percentage. Repeat the comparison with seven days on each side. Moves were selected operationally, pre-trends differ, and other banks could lose displaced wagers. These are descriptive comparisons.</Details>
    </Panel>
  );
}

function HistoricalEconomics() {
  const { data } = useModel();
  const comparable = data.moves.filter(({ main }) => main?.capture != null);
  return (
    <>
      <Note>{'Only ' + comparable.length + ' of 4 moves started with a gap to capture: one captured more than all of it, the other lost ground. None matches the proposed route and configuration.'}</Note>
      <Table headers={['Machine', 'Target peers', 'Pre-move gap/hr', 'Matched gain/hr', '14-day capture', '7-day capture', 'Cabinet theo gain/day', 'Bank pair theo gain/day', 'Implied pair offset']}
        rows={data.moves.filter(r => r.main).map(({ id, main: m, short }) => [
          id, m.targetPeers, cash(m.preGap), cash(m.rateGain), signedPct(m.capture), signedPct(short?.capture), cash(m.focalTheoGain), cash(m.pairTheoGain), signedPct(m.offset),
        ])} />
      <Details title="Interpretation and measurement">Capture divides the matched cabinet gain per available hour by the positive pre-move rate gap between the cabinet and same-configuration destination-zone controls that stayed put throughout the comparison, outside the two affected banks. The offset proxy is one minus the ratio of matched pair expected win to matched cabinet expected win, shown only for positive cabinet gain. Negative and above-100% values can occur because the comparisons are noisy and use different controls. These are descriptive observations, and the affected pair excludes the rest of the floor. Leave the move unfunded until comparable evidence supports clearing break-even with a displacement allowance.</Details>
    </>
  );
}

function InspectionWindowSummary() {
  const { inspectionSlot, windowHold, inspectionGapPerDay } = useModel();
  const hour = String(inspectionSlot.hour).padStart(2, '0'), end = String(inspectionSlot.hour + 2).padStart(2, '0');
  return (
    <>
      <Takeaway>{'M-1158 inspection window · ' + inspectionSlot.weekday + ', ' + inspectionSlot.date + ', ' + hour + ':00–' + end + ':00 Las Vegas time.'}</Takeaway>
      <Note>{'Costs about ' + cash(inspectionSlot.coin * windowHold) + ' in expected win, ' + cash((inspectionSlot.typical - inspectionSlot.coin) * windowHold) + ' less than a typical window that weekday. ' +
        'Waiting for the quietest slot (' + inspectionSlot.quietestDate + ') would save just ' + cash((inspectionSlot.coin - inspectionSlot.quietestCoin) * windowHold) + ' but could forgo ' + cash(inspectionSlot.waitDays * inspectionGapPerDay) + '. Confirm a technician is available.'}</Note>
      <How>{'Picks the quietest two-hour weekday slot (08:00–18:00 starts) on the first day after lead time, excluding events and holidays, based on ' + inspectionSlot.n + ' fully available past windows (' + cash(inspectionSlot.typical - inspectionSlot.coin) + ' fewer wagers than average).'}</How>
    </>
  );
}

function InspectionEvidence() {
  const { inspect, inspectionGapPerDay, inspectionCeiling, inspectionBreakEven, inspectionCost, weeksBelow, focalWeeks } = useModel();
  return (
    <>
      <Note>{'Below configured hold in ' + n(weeksBelow) + ' of ' + n(focalWeeks.length) + ' weeks (95% interval ' + pp(inspect.lo) + ' to ' + pp(inspect.hi) + ', adjusted q ' + (inspect.q < .001 ? '< 0.001' : '= ' + n(inspect.q, 3)) + '). That’s strong evidence it isn’t luck, but not the odds of a fault or a fix.'}</Note>
      <Line label="Historical payout shortfall per day" value={cash(inspectionGapPerDay)} />
      <Line label="30 days at the historical gap" value={cash(30 * inspectionGapPerDay)} />
      <Line label="Conditional July recovery after lead time" value={cash(inspectionCeiling)} />
      <Line label="Break-even chance of full correction" value={pct(inspectionBreakEven, 1)} />
      <Table headers={['Assumed chance of full correction', 'July expected net after inspection']} rows={[.10, .20, .30, .50].map(p => [pct(p, 0), cash(p * inspectionCeiling - inspectionCost)])} />
      <Note>Assumes a real, fixable fault and July play like the audit period; otherwise recovery is zero. Repair cost and the two-hour interruption aren’t included.</Note>
    </>
  );
}

function RepairScenarioResults({ quote, otherCost }) {
  const { inspectionCost, inspectionSlot, windowHold, repairScenarios, inspectionGapPerDay, repairPaybackDays } = useModel();
  const inspectionTotal = inspectionCost + inspectionSlot.coin * windowHold;
  return (
    <Table headers={['Recovery', '30-day gross benefit', 'Maximum repair quote', 'Quote clears 30 days?', 'Total project payback']} rows={repairScenarios.map(share => {
      const daily = inspectionGapPerDay * share;
      const gross = daily * repairPaybackDays;
      const remaining = gross - otherCost;
      const payback = (quote + otherCost + inspectionTotal) / daily;
      return [pct(share, 0), cash(gross), remaining < 0 ? 'No room for a quote' : cash(remaining),
        quote == null ? '—' : quote <= remaining ? 'Yes' : 'No', quote == null ? '—' : n(payback, 1) + ' operating days'];
    })} />
  );
}

const EMPTY_STATUS = 'Enter a quote to check the three scenarios.';

/** Repair quote widget; mirrors the original updateRepairResults on every input. */
function RepairApproval() {
  const quoteRef = useRef(null), otherRef = useRef(null);
  const [result, setResult] = useState({ valid: true, quote: null, other: 0, status: EMPTY_STATUS });
  const update = () => {
    const quote = quoteRef.current, other = otherRef.current;
    if (quote.validity.badInput || !quote.validity.valid || !other.validity.valid) {
      setResult({ valid: false, status: 'Enter nonnegative dollar amounts for the repair quote and added costs.' });
      return;
    }
    const amount = quote.value === '' ? null : quote.valueAsNumber;
    setResult({ valid: true, quote: amount, other: other.valueAsNumber || 0,
      status: amount == null ? EMPTY_STATUS : 'Scenario results updated. The 50% case is the planning assumption.' });
  };
  return (
    <>
      <h3>When to approve a repair</h3>
      <Note>Once a fault is confirmed, enter the quote plus downtime and added costs. Approve if the 50% case pays back within 30 operating days; 25% shows the downside.</Note>
      <div className="repair-inputs">
        <label>Repair quote ($)<input id="repair-quote" ref={quoteRef} type="number" min="0" step="0.01" placeholder="Enter quote" onChange={update} /></label>
        <label>Downtime and added costs ($)<input id="repair-other" ref={otherRef} type="number" min="0" step="0.01" defaultValue="0" onChange={update} /></label>
      </div>
      <div className="repair-grid" id="repair-results">{result.valid && <RepairScenarioResults quote={result.quote} otherCost={result.other} />}</div>
      <p id="repair-status" role="status" className="muted">{result.status}</p>
      <How>Maximum quote = 30-day gross benefit − downtime and added costs. Payback includes the inspection fee and its interruption, counts from when play resumes, and treats entered costs as one-time. Update recovery using the technician’s findings.</How>
    </>
  );
}

function Promotion() {
  const { data, promotion, promoCost, retainedTheo, promoHurdle } = useModel();
  const cases = [.15, .25, .50];
  return (
    <>
      <Takeaway>{'Unfunded in the July plan. The ' + cash(promoCost) + ' stays in the reserve and is spent only if the trigger below is met by July 4.'}</Takeaway>
      <Line label="Catalog terms" value={cash(promoCost) + ' per weekend · ' + promotion[4] + ' days’ lead · up to ' + promotion[6] + ' weekends'} />
      <Table headers={['Past event', 'Days', 'Event wager lift', 'Event expected win lift', 'Next 7 days · wagers', 'Next 7 days · expected win', 'Combined expected win lift', 'Break-even share']}
        rows={data.promotions.map(event => [
          event.name.replace('Gilded Ace ', ''), n(event.during.days), cash(event.during.coin), cash(event.during.theo),
          cash(event.after.coin), cash(event.after.theo), cash(retainedTheo(event)), pct(promoCost / retainedTheo(event), 1)])} />
      <Note>{'Lift is measured against same-weekday, same-month days without events (smallest comparison set: ' + Math.min(...data.promotions.map(event => event.after.minControls)) + ' day). The following week dipped only slightly, but past event costs are unknown.'}</Note>
      <Table headers={['Assumed share of historical combined lift', 'Tournament-like net', 'Locals-like net']}
        rows={cases.map(share => [pct(share, 0), ...data.promotions.map(event => cash(share * retainedTheo(event) - promoCost))])} />
      <Note>Share = how much of the past lift a shorter July event keeps. Extra staffing, comps or prizes beyond catalog cost raise the hurdle.</Note>
      <Details title="Pilot gate and measurement">{'If signed off by July 4, July 18–20 leaves the catalog lead and room for a full seven-day follow-up. Require registration evidence and an all-in budget supporting more than ' + pct(promoHurdle, 1) + ' of the weaker historical lift at catalog cost. Build routine staffing from the weekday forecast and price extra event coverage using registrations. Before launch, freeze non-event matched weekdays and a recent pre-event trend as comparisons. Track whole-floor wagers, configured expected win, attendance and incremental costs during the event and seven days after. Count the follow-up once. Require positive incremental contribution after all costs under both comparisons before funding a second weekend. Waiting could forgo a profitable event and delays learning. If the trigger is not met by July 4, the ' + cash(promoCost) + ' stays in the reserve.'}</Details>
    </>
  );
}

function ConsideredActions() {
  const { data, catalogue, fullDays, netMove, actionCost, reserve, promoHurdle, retainedTheo, compFinding: f, downtime: dt } = useModel();
  const comp = catalogue['A-COMP-PILOT'];
  const daysAfterLead = action => Math.max(0, 30 - action[4]);
  const { tech, pm } = dt, [dayTest, swingTest] = dt.tests, best = tech.best;
  const minutes = v => n(v, 0) + ' min';
  const compSpend = sum(data.property, r => r[9]) / fullDays * daysAfterLead(comp);
  const reasons = {
    'A-MOVE-MACHINE': 'Deferred. 50% capture and 10% displacement implies ' + cash(netMove(.5, .10)) + ' net.',
    'A-MOVE-BANK': 'Deferred. The four cabinet moves do not establish a bank-wide lift large enough to justify the cost and full-bank interruption.',
    'A-REPLACE-LEASE': 'Pass. ' + cash(catalogue['A-REPLACE-LEASE'][3] / 100) + '/day after installation. The screened cabinets show no weak local demand signal.',
    'A-REPLACE-BUY': 'Pass. ' + daysAfterLead(catalogue['A-REPLACE-BUY']) + ' July operating days after lead. A purchase needs evidence of a title or cabinet problem.',
    'A-TECH-SHIFT': (best.value >= tech.cost ? 'Fund. ' : 'Pass. ') + (dayTest.lo > 0 && swingTest.lo > 0 ? 'Staffing matters: ' : 'Staffing shows no clear effect: ') + 'with one technician, weekday day-shift faults waited ' + minutes(dayTest.mean1) + ' for work to start against ' + minutes(dayTest.mean2) +
      ' with two (gap 95% interval ' + n(dayTest.lo, 0) + '–' + n(dayTest.hi, 0) + ' min), and swing ' + minutes(swingTest.mean1) + ' against ' + minutes(swingTest.mean2) + '. The best target is the ' + ['day', 'swing', 'grave'][best.shift] +
      ' shift, which had one technician on ' + n(best.loneDays) + ' of ' + n(best.days) + ' days. A second technician there would remove about ' + n(best.avoidedPerDay, 1) + ' machine-hours of waiting a day, worth ' + cash(best.value) +
      ' in expected win over ' + tech.days + ' days (' + cash(best.low) + '–' + cash(best.high) + '), so it needs ' + n(tech.need, 1) + '× that value to pay ' + cash(tech.cost) + '. Even removing all waiting would return ' + cash(best.all) + '.',
    'A-PREVENTIVE': (pm.breakEven <= .5 ? 'Fund. ' : 'Pass. ') + pm.full.make + ' faults ' + n(1000 * pm.full.rate, 1) + ' times per 1,000 machine-days against ' + n(1000 * pm.full.others, 1) + ' for the other makes, and ' + pct(pm.full.repeat, 0) +
      ' of its faults recur within 14 days. If a sweep brought it level for ' + pm.days + ' days, avoided downtime and repair bills would be worth at most ' + cash(pm.full.upper) + ' (' + cash(pm.recent.upper) + ' at April–June rates). After ' + cash(pm.sweepDowntime) +
      ' of sweep downtime on ' + n(pm.cabinets) + ' cabinets, ' + cash(pm.cost) + ' breaks even only if the sweep removes ' + pct(pm.breakEven, 0) + ' of the excess faults (' + pct(pm.breakEvenRecent, 0) + ' at recent rates). The ' + n(dt.overlap.maintenance) + ' scheduled-maintenance tickets on record are too few to show what a sweep achieves.',
    'A-INSPECT': 'Fund one. Meter and paytable checks target the persistent payout flag on M-1158.',
    'A-WAYFINDING': 'Deferred. Quiet placement warrants a traffic test before committing to a signage refresh.',
    'A-COMP-PILOT': 'Deferred. ' + (f.detected
      ? 'The loyalty ledger shows comps were repriced on ' + f.date + ' (' + f.price + ', ' + f.priceChange + ', ' + f.withinShare + ' of it within tiers). Comp cost per $100 of carded expected win went from ' + f.reinvest + '. Read that change in July data before paying for a pilot. '
      : 'The loyalty ledger shows no break in comp prices, earn rates or tier rules. ') +
      'Savings alone would need ' + pct(actionCost(comp) / compSpend, 0) + ' of ' + cash(compSpend) + ' in projected ' + daysAfterLead(comp) + '-day comp cost. The pilot and a floor-wide change are mutually exclusive, so at most one can run.',
    'A-COMP-CHANGE': 'Pass. ' + (f.detected
      ? 'A floor-wide change already took effect on ' + f.date + ': comps redeemed per $100k of carded wagers moved ' + f.rateChange + (f.rateMoved ? '' : ' (no clear change)') + ' while cost per $100 of carded expected win moved ' + f.reinvestChange + '. A second change now would blur the read on the first. '
      : 'The ledger shows no past change to learn from, and cost per face-value dollar was stable. ') +
      'It also cannot run alongside the pilot; the catalog makes them mutually exclusive.',
    'A-PROMO': 'Unfunded. Trigger: pay ' + cash(actionCost(catalogue['A-PROMO'])) + ' from the reserve for one weekend only if, by July 4, registrations and an all-in budget support more than ' + pct(promoHurdle, 1) + ' of the weaker past event lift. At 25% it nets ' + cash(.25 * Math.min(...data.promotions.map(retainedTheo)) - actionCost(catalogue['A-PROMO'])) + ', so the evidence alone does not clear it.',
    'A-SURVEY': 'Deferred. Current traffic data support comparing visits with wagering. Revisit for a specific unanswered conversion question.',
    'A-HOLD': 'Selected. Retain ' + cash(reserve) + ' pending evidence for other actions; it covers the promotion weekend only if that trigger is met.',
  };
  return (
    <>
      <div className="action-summary">
        <Table headers={['Catalog action', 'July cost per unit', 'Decision and reason']} rows={data.actions.map(action => [action[1], cash(actionCost(action)), reasons[action[0]]])} />
      </div>
      <Note>Costs include recurring July charges after lead time. Risk and spend figures use historical daily rates.</Note>
    </>
  );
}

/** Constraint checks as text pass marks, so the result never relies on color alone. */
function PlanChecks({ checks }) {
  return (
    <ul className="plan-checks" aria-label="Plan rule checks">
      {checks.map(c => (
        <li key={c.key} className={c.pass ? 'pass' : 'fail'} data-check={c.key}>
          <span aria-hidden="true">{c.pass ? '✓ ' : '✗ '}</span><b>{c.pass ? 'Pass' : 'Fails'}</b>{' · ' + c.label + '. '}<span className="muted">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** The recommended July plan, priced line by line with the guide §6 formula, totalling exactly $100,000 with the reserve. */
function BudgetLedger() {
  const { julyPlan: L, catalogue, promoCost, actionCost } = useModel();
  const hold = catalogue['A-HOLD'];
  const rows = [
    ...L.lines.map(l => [l.action[1] + ' (' + l.action[0] + ')', n(l.item.qty) + (l.targets.length ? ' · ' + l.targets.join(', ') : ''), l.formula, cash(l.cost), l.window]),
    [hold[1] + ' (' + hold[0] + ')', '—', cash(BUDGET) + ' − ' + cash(L.spent), cash(L.reserve), 'July 1–30 · covers the promotion weekend only if its trigger is met'],
    [<b>Total</b>, '', L.arithmetic, <b>{cash(L.spent + L.reserve)}</b>, ''],
  ];
  return (
    <Panel title="July budget ledger" id="budget-ledger">
      <div className="action-summary"><Table headers={['Funded action', 'Quantity and targets', 'Cost formula', 'July cost', 'Benefit window after lead']} rows={rows} /></div>
      <Line label="Ledger total" value={L.arithmetic} />
      <PlanChecks checks={L.checks} />
      <Note>{'Cost = quantity × (unit cost + recurring cost per day × max(0, 30 − lead days)), from the catalog. Purchased cabinets have no recurring charge, so their full ' + cash(actionCost(catalogue['A-REPLACE-BUY'])) + ' counts against July. Keeping the budget uses no action slot. The ' + cash(promoCost) + ' promotion weekend is not in the ledger: it is unfunded unless its trigger is met.'}</Note>
    </Panel>
  );
}

/** Whole-number quantity with validation; only a valid value reaches the plan (and the URL). */
function QuantityInput({ id, value, max, onCommit }) {
  const [raw, setRaw] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => { setRaw(String(value)); setError(''); }, [value]);
  const change = event => {
    const text = event.target.value;
    setRaw(text);
    if (/^[0-9]+$/.test(text) && Number(text) >= 1 && Number(text) <= max) { setError(''); if (Number(text) !== value) onCommit(Number(text)); }
    else setError('Enter a whole number from 1 to ' + max + '.');
  };
  return (
    <label className="builder-field">Quantity (1–{max})
      <input id={id} type="number" min="1" max={max} step="1" inputMode="numeric" value={raw} onChange={change} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? id + '-error' : undefined} />
      {error && <span id={id + '-error'} className="field-error" role="alert">{error}</span>}
    </label>
  );
}

/** A labelled range slider with its value always visible. */
function Slider({ id, label, value, min = 0, max = 100, onChange }) {
  return (
    <div className="builder-slider">
      <span className="statline"><span><label htmlFor={id}>{label}</label><InfoFor kind="line" label={label} /></span><output htmlFor={id} id={id + '-value'}>{value + '%'}</output></span>
      <input id={id} type="range" min={min} max={max} step="1" value={value} aria-valuetext={value + '%'} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

/** Sensitivity controls shared by the builder: expected nets update live, and the values persist in the URL. */
function Sensitivity() {
  const { state, go } = useNav();
  const { inspectionCeiling, inspectionCost, netMove, promoCost, retainedTheo, data, inspect, move } = useModel();
  const weak = Math.min(...data.promotions.map(retainedTheo));
  const set = key => value => go({ [key]: value }, { replace: true });
  return (
    <Panel title="Sensitivity: change the assumptions">
      <div className="builder-sliders">
        <Slider id="sens-fix" label="Chance the inspection finds and fully corrects a fault" value={state.fix} onChange={set('fix')} />
        <Slider id="sens-cap" label="Placement gap the move captures" value={state.cap} onChange={set('cap')} />
        <Slider id="sens-dis" label="Move gain displaced from other machines" value={state.dis} onChange={set('dis')} />
        <Slider id="sens-keep" label="Share of past promotion lift a July weekend keeps" value={state.keep} onChange={set('keep')} />
      </div>
      <div role="status" aria-live="polite">
        <Line label="Inspection expected net" value={cash(state.fix / 100 * inspectionCeiling - inspectionCost) + ' · ' + inspect.id} />
        <Line label="Move expected net" value={cash(netMove(state.cap / 100, state.dis / 100)) + ' · ' + move.id} />
        <Line label="Promotion weekend expected net" value={cash(state.keep / 100 * weak - promoCost) + ' · weaker past event'} />
      </div>
      <button type="button" onClick={() => go({ ...SENSITIVITY }, { focus: '#sens-fix' })}>Reset assumptions</button>
      <Note>Defaults: 25% correction is the downside repair case, 50% capture with 10% displacement is the move case quoted throughout, and 25% of the weaker past lift sits just below the promotion break-even. All are assumptions, not estimates.</Note>
    </Panel>
  );
}

function BuilderItem({ items, index, update, remove }) {
  const { planner: P, catalogue } = useModel();
  const item = items[index], a = catalogue[item.id], kind = P.kindOf(item.id), limit = P.limit(item.id);
  const base = 'builder-' + item.id.toLowerCase();
  const setTargets = targets => update({ ...item, targets, qty: targets.length });
  const canAdd = kind && item.qty < limit && P.nextTarget(items, index) != null;
  return (
    <fieldset className="builder-item" data-action={item.id}>
      <legend>{a[1]}</legend>
      <p className="muted">{cash(a[2] / 100) + (a[3] ? ' + ' + cash(a[3] / 100) + '/day' : '') + ' per unit' + (a[3] ? ' (' + cash(P.cost({ id: item.id, qty: 1 })) + ' in July)' : '') + ' · ' + n(a[4]) + '-day lead · up to ' + n(limit)}</p>
      {kind ? (
        <div className="builder-targets">
          {item.targets.map((t, j) => (
            <div key={j} className="builder-target">
              <label className="builder-field">{'Target ' + (j + 1) + ' (' + kind + ')'}
                <select id={base + '-t' + j} value={t} onChange={e => setTargets(item.targets.map((x, k) => k === j ? e.target.value : x))}>
                  {P.options[kind].map(o => <option key={o.value} value={o.value} disabled={o.value !== t && !P.canTarget(items, index, o.value, j)}>{o.label}</option>)}
                </select>
              </label>
              {item.qty > 1 && <button type="button" aria-label={'Remove target ' + (j + 1) + ' from ' + a[1]} onClick={() => setTargets(item.targets.filter((_, k) => k !== j))}>Remove</button>}
            </div>
          ))}
          <button type="button" id={base + '-add'} disabled={!canAdd} onClick={() => setTargets([...item.targets, P.nextTarget(items, index)])}>
            {item.qty >= limit ? 'Catalog limit reached' : 'Add a target'}
          </button>
          <p className="muted">{'Quantity ' + n(item.qty) + ' of ' + n(limit) + '. Targets that would conflict with another action are unavailable.'}</p>
        </div>
      ) : <QuantityInput id={base + '-qty'} value={item.qty} max={limit} onCommit={qty => update({ ...item, qty })} />}
      <button type="button" className="builder-remove" onClick={remove}>{'Remove ' + a[1].toLowerCase()}</button>
    </fieldset>
  );
}

/** Pick up to three catalog actions, set quantities and targets, and see cost, reserve and benefit ranges under the catalog rules. */
function PlanBuilder() {
  const { planner: P, catalogue } = useModel();
  const { state, go } = useNav();
  const items = P.parse(state.plan) ?? P.recommended;
  const sens = { fix: state.fix / 100, cap: state.cap / 100, dis: state.dis / 100, keep: state.keep / 100 };
  const L = P.ledger(items);
  const addable = P.actions.filter(a => !P.blockReason(items, a[0]));
  const [pick, setPick] = useState('');
  const choice = addable.some(a => a[0] === pick) ? pick : addable[0]?.[0] ?? '';
  const save = (next, opts) => go({ plan: P.encode(next) }, opts);
  const add = () => { const item = P.newItem(items, choice); if (item) save([...items, item], { focus: '#builder-' + choice.toLowerCase() + (P.kindOf(choice) ? '-t0' : '-qty') }); };
  let estimated = 0, expected = 0;
  const rows = L.lines.map(l => {
    const b = P.benefit(l.item, sens);
    if (b?.expected != null) { estimated += l.cost; expected += b.expected; }
    return [l.action[1], n(l.item.qty) + (l.targets.length ? ' · ' + l.targets.join(', ') : ''), cash(l.cost), l.window,
      b ? cash(b.lo) + ' to ' + cash(b.hi) + ' gross' + (b.covered < l.item.qty ? ' (' + n(b.covered) + ' of ' + n(l.item.qty) + ' units have an estimate)' : '') + '. ' + b.note : 'No benefit estimate in the evidence.',
      b?.expected != null ? cash(b.expected - l.cost) : '— (cost only)'];
  });
  const over = L.spent - BUDGET;
  return (
    <>
      <Panel title="Build your own plan" id="plan-builder">
        <Note>{'Fund up to ' + MAX_TYPES + ' catalog action types. The builder enforces each quantity limit, the comp pilot and floor-wide comp exclusion, one move or replacement per machine (a bank move covers its machines), and July lead times. Your plan is saved in the page link.'}</Note>
        <div className="builder-add">
          <label className="builder-field">Add an action
            <select id="builder-add" value={choice} onChange={e => setPick(e.target.value)} disabled={!addable.length}>
              {P.actions.map(a => { const why = P.blockReason(items, a[0]); return <option key={a[0]} value={a[0]} disabled={!!why}>{a[1] + ' · ' + cash(P.cost({ id: a[0], qty: 1 })) + (why ? ' · unavailable: ' + why : '')}</option>; })}
            </select>
          </label>
          <button type="button" id="builder-add-button" onClick={add} disabled={!choice}>Add action</button>
        </div>
        <div className="builder-items">
          {items.length ? items.map((item, i) => (
            <BuilderItem key={item.id} items={items} index={i} update={next => save(items.map((x, k) => k === i ? next : x))} remove={() => save(items.filter((_, k) => k !== i), { focus: '#builder-add' })} />
          )) : <p className="muted">No actions funded: the whole budget is kept, which the guide treats as a valid choice.</p>}
        </div>
        <div className="builder-buttons">
          <button type="button" id="builder-reset" onClick={() => go({ plan: '' }, { focus: '#builder-reset' })}>Reset to recommended plan</button>
          <button type="button" id="builder-clear" onClick={() => go({ plan: 'none' }, { focus: '#builder-clear' })}>Keep the whole budget</button>
        </div>
      </Panel>
      <Panel title="Your plan's cost, reserve and benefit">
        <div className="action-summary"><Table headers={['Action', 'Quantity and targets', 'July cost', 'Benefit window after lead', 'Estimated July benefit range', 'Expected net at your assumptions']} rows={rows} /></div>
        <div role="status" aria-live="polite" id="builder-totals">
          <Line label="Plan cost" value={cash(L.spent)} />
          <Line label="Remaining reserve" value={cash(L.reserve)} />
          <Line label="Expected net of estimated actions" value={cash(expected - estimated) + (estimated < L.spent ? ' · ' + cash(L.spent - estimated) + ' more spent with no estimate' : '')} />
        </div>
        {over > 0 && <p className="plan-warning" role="alert"><span aria-hidden="true">⚠ </span><b>Over budget</b>{' by ' + cash(over) + '. Remove units or an action to fit ' + cash(BUDGET) + '.'}</p>}
        <PlanChecks checks={L.checks} />
        <Note>Benefit ranges are July gross expected win before each action’s own cost, from the same model functions as the rest of this tab; expected net subtracts the cost. Ranges are scenarios, not confidence intervals.</Note>
      </Panel>
      <Sensitivity />
    </>
  );
}

export default function Plan() {
  const m = useModel();
  const nav = useNav();
  const { data, fullSummary, catalogue, inspect, move, inspection, destination, destinationPeers, recentRate, destinationRate,
    inspectionCost, inspectionCeiling, inspectionBreakEven, promoCost, promoHurdle, retainedTheo, moveCost, netMove, moveBreakEven, reserve, actionCost, relocation, last, zones, moveControls } = m;
  const suspects = fullSummary.slice(0, 10);

  const views = {
    summary: () => (
      <>
        <Panel title="July action summary" id="action-summary">
          <div className="action-summary">
            <Table headers={['Action', 'Cost', 'Expected effect', 'Uncertainty', 'Measurement', 'Claim and evidence']} rows={[
              ['Inspect M-1158', cash(inspectionCost), cash(inspectionCeiling) + ' conditional July recovery', pct(inspectionBreakEven, 1) + ' break-even chance of full correction before remediation and interruption', 'Verify meter and paytable; compare four weeks before and after against matched peers.', <TraceClaim id="claim-m1158" />],
              ['Promotion weekend · unfunded, with a trigger', '$0 now · ' + cash(promoCost) + ' from the reserve if triggered', cash(.25 * retainedTheo(data.promotions.at(-1)) - promoCost) + ' at 25% of the Locals historical lift', 'Trigger by July 4: registrations and an all-in budget supporting more than ' + pct(promoHurdle, 1) + ' of the weaker historical lift', 'Compare whole-floor incremental expected win during the event and for seven days after, then subtract all incremental costs.', <TraceClaim id="claim-promotion" />],
              ['Defer M-1181 move', cash(moveCost) + ' if authorized', cash(netMove(.5, 0)) + ' at 50% capture with zero displacement; ' + cash(netMove(.5, .10)) + ' at 10% displacement', 'Waiting could miss a positive result; four moves offer mixed evidence', 'If approved later, measure net expected win across affected banks against comparable banks.', <TraceClaim id="claim-decision" />],
            ]} />
          </div>
        </Panel>
        <BudgetLedger />
        <Panel title="Why keep the rest?">
          <Line label="Bottom-ten cabinets flagged for quiet placement" value={n(suspects.filter(x => x.flags.includes('Quiet zone')).length) + ' of ' + suspects.length} />
          <Line label="Bottom-ten cabinets flagged for downtime" value={n(suspects.filter(x => x.flags.includes('Downtime')).length) + ' of ' + suspects.length} />
          <Note>{'A purchase costs ' + cash(actionCost(catalogue['A-REPLACE-BUY'])) + ' per cabinet and leaves ' + (30 - catalogue['A-REPLACE-BUY'][4]) + ' operating days after lead time. The evidence supports checking payout first.'}</Note>
        </Panel>
      </>
    ),
    inspection: () => (
      <Panel title="The decision and its evidence" id="inspection-plan">
        <Note>Based on the full January–June audit and the June 30 floor layout.</Note>
        <div className="grid split">
          <div>
            <h3>{'1 · Verify ' + inspect.id + '’s payout configuration'}</h3>
            <Line label="Observed / configured hold" value={pct(inspect.hold, 2) + ' / ' + pct(ratio(inspect.theo, inspect.coin), 2)} />
            <Line label="House win below configured expectation" value={cash(inspect.theo - inspect.win)} />
            <Line label="Coin-in per hour vs local peers" value={pct(inspect.local, 0)} />
            <p>{'Book ' + inspection[5] + ' minutes of downtime in a quiet window after the ' + n(inspection[4]) + '-day lead. Check the paytable, configuration, meters and logs, and record any fix.'}</p>
            <InspectionWindowSummary />
            <InspectionEvidence />
            <RepairApproval />
            <Note>After a fix, compare four weeks of payout gap with the prior four weeks and same-configuration peers. If no fault is found, record zero recovery.</Note>
            <button data-evidence={inspect.id} onClick={() => nav.openEvidence(inspect.id)}>{'Open ' + inspect.id + ' audit'}</button>
          </div>
          <div>
            <h3>{'2 · Defer the ' + move.id + ' relocation'}</h3>
            <Line label="Target slot" value={destination[1] + ' / ' + destination[0] + ' · vacant June 30'} />
            <Line label="June theo per available hour" value={cash(recentRate) + ' source / ' + cash(destinationRate) + ' destination peers'} />
            <Line label="Same-config destination cabinets" value={n(new Set(destinationPeers.map(r => r.id)).size)} />
            <p>{'If approved later: confirm the slot, allow ' + n(relocation[4]) + ' days’ lead and a ' + n(relocation[5] / 60, relocation[5] % 60 ? 1 : 0) + '-hour move, keep the configuration, compare it with same-configuration ' + zones[last.zone] + ' cabinets that stay put (' + moveControls.join(', ') + '), and pick comparison banks beforehand.'}</p>
            <Note>{'Waiting could forgo about ' + cash(netMove(.5, 0)) + ' (50% capture, no displacement), but at 10% displacement that becomes ' + cash(netMove(.5, .10)) + '. Past moves make displacement a real risk.'}</Note>
            <button data-evidence={move.id} onClick={() => nav.openEvidence(move.id)}>{'Open ' + move.id + ' audit'}</button>
          </div>
        </div>
      </Panel>
    ),
    moves: () => (
      <>
        <Moves />
        <Panel title="What past moves tell us about the assumptions"><HistoricalEconomics /></Panel>
        <Panel title="Relocation economics with displaced play">
          <MoveSensitivity />
          <Note>{'Reconsider if comparable moves or a pilot show more than ' + pct(moveBreakEven / .75, 0) + ' capture at 25% displacement, and the floor-wide gain clears ' + cash(moveCost) + ' after disruption.'}</Note>
          <Details title="Pilot measurement and expansion rule">Before the move, fix the source, destination, nearby banks, and comparison banks. Compare the 28-day July operating window, including the partial move day, with 28 days before the move, matched by weekday. Estimate incremental expected win for the affected banks as a group against the comparison trend, account for move-day downtime once, and check the rest of the floor for offsets. Use M-1179 for the separate cabinet-rate comparison. Expand only if the net floor gain clears $1,800 and the conclusion survives reasonable comparison choices. Hold if the signal is too noisy.</Details>
        </Panel>
      </>
    ),
    promotion: () => <Panel title="Promotion weekend evidence" id="promotion-check"><Promotion /></Panel>,
    catalog: () => <Panel title="Decisions across the action catalog" id="catalog-check"><ConsideredActions /></Panel>,
    builder: () => <PlanBuilder />,
  };

  return (
    <>
      <Metrics>
        <Card label="Inspection · 1 unit" value={cash(inspectionCost)} sub={inspect.id + ' · ' + inspection[4] + ' day lead'} />
        <Card label="Relocation · deferred" value={cash(moveCost)} sub={move.id + ' · cost if authorized later'} />
        <Card label="Reserve" value={cash(reserve)} sub="July 1–30 · inspection only" />
        <Card label="Move break-even" value={pct(moveBreakEven, 0)} sub="Placement gap captured at zero displacement" />
      </Metrics>
      {/* Remount per sub-tab: the original redrew the sub-tab bar, so Back/forward left focus on the body. */}
      <Tabbed tab="plan" views={views} />
    </>
  );
}
