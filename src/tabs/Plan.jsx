import { useRef, useState } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { Card, Details, How, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { cash, n, pct, pp, ratio, signedPct, sum } from '../lib/format.js';

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

function Metric({ label, value, format }) {
  return <div><dt>{label}</dt><dd className={value < 0 ? 'red' : value > 0 ? 'green' : ''}>{format(value)}</dd></div>;
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
      <Takeaway>{'Keep the promotion on the shortlist. Hold the ' + cash(promoCost) + ' until registrations and a staffed operating plan support a pilot above the break-even hurdle.'}</Takeaway>
      <Line label="Catalog terms" value={cash(promoCost) + ' per weekend · ' + promotion[4] + ' days’ lead · up to ' + promotion[6] + ' weekends'} />
      <Table headers={['Past event', 'Days', 'Event wager lift', 'Event expected win lift', 'Next 7 days · wagers', 'Next 7 days · expected win', 'Combined expected win lift', 'Break-even share']}
        rows={data.promotions.map(event => [
          event.name.replace('Gilded Ace ', ''), n(event.during.days), cash(event.during.coin), cash(event.during.theo),
          cash(event.after.coin), cash(event.after.theo), cash(retainedTheo(event)), pct(promoCost / retainedTheo(event), 1)])} />
      <Note>{'Lift is measured against same-weekday, same-month days without events (smallest comparison set: ' + Math.min(...data.promotions.map(event => event.after.minControls)) + ' day). The following week dipped only slightly, but past event costs are unknown.'}</Note>
      <Table headers={['Assumed share of historical combined lift', 'Tournament-like net', 'Locals-like net']}
        rows={cases.map(share => [pct(share, 0), ...data.promotions.map(event => cash(share * retainedTheo(event) - promoCost))])} />
      <Note>Share = how much of the past lift a shorter July event keeps. Extra staffing, comps or prizes beyond catalog cost raise the hurdle.</Note>
      <Details title="Pilot gate and measurement">{'If signed off by July 4, July 18–20 leaves the catalog lead and room for a full seven-day follow-up. Require registration evidence and an all-in budget supporting more than ' + pct(promoHurdle, 1) + ' of the weaker historical lift at catalog cost. Build routine staffing from the weekday forecast and price extra event coverage using registrations. Before launch, freeze non-event matched weekdays and a recent pre-event trend as comparisons. Track whole-floor wagers, configured expected win, attendance and incremental costs during the event and seven days after. Count the follow-up once. Require positive incremental contribution after all costs under both comparisons before funding a second weekend. Waiting could forgo a profitable event and delays learning. Without the gate, keep the reserve.'}</Details>
    </>
  );
}

function ConsideredActions() {
  const { data, catalogue, auditRows, fullDays, netMove, actionCost, reserve } = useModel();
  const maintenance = catalogue['A-PREVENTIVE'], tech = catalogue['A-TECH-SHIFT'], comp = catalogue['A-COMP-PILOT'];
  const daysAfterLead = action => Math.max(0, 30 - action[4]);
  const projected = (rows, action) => sum(rows, r => r.lostTheo) / fullDays * daysAfterLead(action);
  const ridge = auditRows.filter(r => r.make === 'Ridgeline');
  const ridgeRisk = projected(ridge, maintenance), techRisk = projected(auditRows, tech);
  const compSpend = sum(data.property, r => r[9]) / fullDays * daysAfterLead(comp);
  const reasons = {
    'A-MOVE-MACHINE': 'Deferred. 50% capture and 10% displacement implies ' + cash(netMove(.5, .10)) + ' net.',
    'A-MOVE-BANK': 'Deferred. The four cabinet moves do not establish a bank-wide lift large enough to justify the cost and full-bank interruption.',
    'A-REPLACE-LEASE': 'Pass. ' + cash(catalogue['A-REPLACE-LEASE'][3] / 100) + '/day after installation. The screened cabinets show no weak local demand signal.',
    'A-REPLACE-BUY': 'Pass. ' + daysAfterLead(catalogue['A-REPLACE-BUY']) + ' July operating days after lead. A purchase needs evidence of a title or cabinet problem.',
    'A-TECH-SHIFT': 'Pass. Needs ' + pct(actionCost(tech) / techRisk, 0) + ' of ' + cash(techRisk) + ' floor-wide exposure over ' + daysAfterLead(tech) + ' days. One shift covers only part of the schedule.',
    'A-PREVENTIVE': 'Pass. Ridgeline has ' + cash(ridgeRisk) + ' at risk over ' + daysAfterLead(maintenance) + ' days, before the sweep’s own downtime.',
    'A-INSPECT': 'Fund one. Meter and paytable checks target the persistent payout flag on M-1158.',
    'A-WAYFINDING': 'Deferred. Quiet placement warrants a traffic test before committing to a signage refresh.',
    'A-COMP-PILOT': 'Deferred. Needs ' + pct(actionCost(comp) / compSpend, 0) + ' savings on ' + cash(compSpend) + ' in projected ' + daysAfterLead(comp) + '-day comp cost to pay back through savings alone.',
    'A-COMP-CHANGE': 'Pass. Comp cost per face-value dollar was stable. Measure contribution in a controlled pilot before changing the rate floor-wide.',
    'A-PROMO': 'Conditional. Prior events justify a shortlist spot. Require a staffed pilot case above the hurdle shown above.',
    'A-SURVEY': 'Deferred. Current traffic data support comparing visits with wagering. Revisit for a specific unanswered conversion question.',
    'A-HOLD': 'Selected. Retain ' + cash(reserve) + ' pending evidence for other actions.',
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
            <Table headers={['Action', 'Cost', 'Expected effect', 'Uncertainty', 'Measurement']} rows={[
              ['Inspect M-1158', cash(inspectionCost), cash(inspectionCeiling) + ' conditional July recovery', pct(inspectionBreakEven, 1) + ' break-even chance of full correction before remediation and interruption', 'Verify meter and paytable; compare four weeks before and after against matched peers.'],
              ['Promotion weekend · conditional', cash(promoCost) + ' if authorized', cash(.25 * retainedTheo(data.promotions.at(-1)) - promoCost) + ' at 25% of the Locals historical lift', 'Needs ' + pct(promoHurdle, 1) + ' of the weaker historical lift at catalog cost', 'Compare whole-floor incremental expected win during the event and for seven days after, then subtract all incremental costs.'],
              ['Defer M-1181 move', cash(moveCost) + ' if authorized', cash(netMove(.5, 0)) + ' at 50% capture with zero displacement; ' + cash(netMove(.5, .10)) + ' at 10% displacement', 'Waiting could miss a positive result; four moves offer mixed evidence', 'If approved later, measure net expected win across affected banks against comparable banks.'],
            ]} />
          </div>
        </Panel>
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
