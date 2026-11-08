// Built-in floor assistant: answers from the dashboard's own computed facts (no AI service, works offline).
// Each answer carries the evidence-map boxes it is about, so the map can point at them.
import { by, cash, month, months, n, pct, pp, sum } from '../lib/format.js';
import { FLAG_LABELS } from '../lib/evidence.js';

const QUESTION_PATTERNS = [
  ['q1', /\bq\s*1\b|machine audit|bottom[\s-]*(ten|10)|lowest|low earn|underperform|verdict|replace/],
  ['q2', /\bq\s*[23]\b|demand|uptime|downtime|traffic|visitor|entrance|repair|ticket|outage|zone|weather|missouri|heat ?map/],
  ['q4', /\bq\s*[45]\b|guest|player|comp\b|comps|loyalty|carded|reward/],
  ['qm', /model|forecast|holdout|validation|predict|staff|mae|accuracy/],
  ['q6', /\bq\s*6\b|july|decision|plan\b|budget|reserve|catalog|spend|fund/],
];
const REAL_SOURCES = ['src-city', 'src-weather', 'src-missouri'];
const STOP = new Set('the a an and or of to in on for is are was were what who how why when about me tell show everything all it this that with do does did give summary summarize explain please can you i we our there their which any from by at be has have'.split(' '));
const words = s => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

/** Numbers that summarize each question, computed from the model the same way the tabs compute them. */
function questionFacts(qid, m) {
  const { data, auditRows, fullDays } = m;
  if (qid === 'q1') {
    return [
      'Of the ten lowest earners, ' + m.quietCohort.length + ' sit in quiet zones, ' + m.payoutCohort.length + (m.payoutCohort.length === 1 ? ' has' : ' have') + ' a payout flag (' + (m.payoutCohort.map(x => x.id).join(', ') || 'none') + '), and ' + m.shortCohort.length + ' had under 60 days on the floor.',
      m.inspect.id + ' kept ' + cash(m.inspect.theo - m.inspect.win) + ' less than its settings imply (payout gap ' + pp(m.inspect.res) + '), which is why it is the one cabinet to inspect.',
      (o => 'Once exposure, luck and placement are removed, ' + (o.both.length ? o.both.length + ' of the ten (' + o.both.map(r => r.id).join(', ') + ')' : 'none of the ten') +
        ' stay in the adjusted bottom ten; the weakest cabinets by that measure are ' + o.adjustedTen.slice(0, 3).map(r => r.id).join(', ') + '.')(m.fullOverlap),
    ];
  }
  if (qid === 'q2') {
    const daily = [...by(data.property, r => month(r[0])).entries()].map(([mo, rows]) => [mo, sum(rows, r => r[3]) / rows.length]);
    const [first, last] = [daily[0], daily.at(-1)];
    return [
      'Daily wagers averaged ' + cash(first[1]) + ' in ' + months[first[0]] + ' and ' + cash(last[1]) + ' in ' + months[last[0]] + ' (raw, before event and weekday adjustment).',
      'Machine downtime put about ' + cash(sum(auditRows, r => r.lost) / fullDays) + ' of wagers at risk per day over ' + n(sum(auditRows, r => r.down), 0) + ' out-of-service hours; even full recovery would not reverse the adjusted decline.',
      n(data.events.length) + ' listed events are compared with similar ordinary days to see how much they lifted play.',
      (zf => 'April to June, property coin-in moved ' + cash(zf.contribution.total) + ' per day. By zone, ' + m.zones[zf.biggest.zone] + ' moved most (' + cash(zf.biggest.change) + '), and ' + m.zones[zf.steepest.zone] +
        ' had the steepest drop in coin-in per available hour. Almost all of the change is coin-in per available hour (' + cash(zf.rate) + ') rather than machine-hours (' + cash(zf.hours) + '). Zone entries fell in ' + n(zf.trafficFell) + ' of ' + n(zf.trafficZones) + ' zones (counters covered ' + pct(zf.coverage, 1) + ' of hours; entries are not unique guests).')(m.zoneFinding),
      (zf => 'Competing explanations from real outside data: ' + (zf.heat[1] < 0 && zf.heat[2] > 0 ? 'heat shows no detectable effect' : 'heat shows an effect') + ' (' + cash(zf.heat[0]) + ' per +10 °C, 95% interval ' + cash(zf.heat[1]) + ' to ' + cash(zf.heat[2]) +
        '); the ' + n(zf.rainDays) + ' rain days ran ' + cash(zf.rainGap) + ' below weekday expectation' + (rain => rain ? ', and ' + n(rain) + ' of them fell in April or June.' : ', but none fell in April or June, so rain can’t explain that change.')(data.weather.days.filter(([, mm], d) => mm >= 1 && [3, 5].includes(month(data.dates[d]))).length) +
        ' Missouri slot handle per day moved ' + pct(zf.moChange) + ' April to June versus ' + pct(zf.ownChange) + ' here' + (Math.sign(zf.moChange) === Math.sign(zf.ownChange) ? ', so part of the change looks market-wide.' : ', so the outside market moved the other way.') + ' Weather and Missouri data are context only, never forecast inputs.')(m.zoneFinding),
    ];
  }
  if (qid === 'q4') {
    const face = sum(data.property, r => r[8]), cost = sum(data.property, r => r[9]);
    return [
      (o => n(o.active) + ' cardholders recorded carded play; the top 1% of them placed ' + pct(o.wagers.top1) + ' of carded wagers and the top 10% placed ' + pct(o.wagers.top10) +
        ' (Gini ' + n(o.wagers.gini, 2) + '). Losses are concentrated too: the 10% of active players who lost the most account for ' + pct(o.losses.top10) + ' of gross losses (Gini ' + n(o.losses.gini, 2) + ').')(m.fullOutcomes),
      (o => n(o.behind) + ' active players ended behind, ' + n(o.ahead) + ' ahead and ' + n(o.even) + ' even. That loss concentration is a reason for responsible-gaming safeguards such as loss-limit and cool-off messages, never for targeting heavy losers.')(m.fullOutcomes),
      (r => 'Loyalty cards recorded ' + pct(sum(r, x => x[4]) / sum(r, x => x[1])) + ' of all machine coin-in; the rest is uncarded play the player tables cannot see, so carded and total house win never match.')(data.carded),
      'Comps cost ' + cash(cost) + ' over January–June, about ' + pct(cost / face, 1) + ' of their face value, and that rate held steady month to month.',
      (f => f.detected
        ? 'The loyalty ledger shows one program change: on ' + f.date + ' comps were repriced from ' + f.price + ' (' + f.priceChange + ', 95% interval ' + f.priceInterval + ' points; ' + f.rank + '). ' +
          f.withinShare + ' of the drop is within tiers, so it is a rule change, not tier mix. Earn rates ' + (f.earnFlat ? 'did not change' : 'also moved') + ' and tier thresholds ' + (m.tierRules.stable ? 'held' : 'moved') + '; comp cost per $100 of carded expected win went from ' + f.reinvest + '.'
        : 'The loyalty ledger shows no break in comp prices, earn rates or tier rules across January–June.')(m.compFinding),
    ];
  }
  if (qid === 'qm') {
    const peaks = m.schedulingScore('Peak', 10);
    return [
      'On 61 unseen May–June days, weekday averages missed by ' + cash(m.m1) + ' a day on average versus ' + cash(m.m7) + ' for "same day last week", ' + pct(1 - m.m1 / m.m7) + ' less error.',
      'At the ' + cash(m.peakThreshold) + ' staffing cutoff the weekday forecast caught ' + peaks.hits + ' of ' + (peaks.hits + peaks.missed) + ' peak days.',
    ];
  }
  if (qid === 'q6') {
    return [
      'The July plan spends ' + cash(m.inspectionCost) + ' to inspect ' + m.inspect.id + ' and keeps ' + cash(m.reserve) + ' in reserve.',
      'Moving ' + m.move.id + ' would cost ' + cash(m.moveCost) + '; at 50% capture it nets ' + cash(m.netMove(.5, 0)) + ' with no displaced play but ' + cash(m.netMove(.5, .10)) + ' at 10% displacement, so it is deferred.',
      'A promotion weekend (' + cash(m.promoCost) + ') stays conditional: it must keep more than ' + pct(m.promoHurdle, 1) + ' of the weaker past event lift to break even.',
    ];
  }
  return [];
}

function machineAnswer(id, m) {
  const rank = m.fullSummary.findIndex(x => x.id === id);
  if (rank < 0) return { text: ['I can’t find ' + id + ' in the January–June audit. Machine ids look like M-1158.'], items: [], focus: null };
  const x = m.fullSummary[rank];
  const flags = x.flags.map(f => FLAG_LABELS[f] ?? f);
  const ids = ['ev-verdicts', 'ev-adjusted'];
  if (id === m.inspect.id) ids.push('ev-hold', 'act-inspect');
  if (id === m.move.id) ids.push('ev-moves', 'ev-move-econ', 'act-move');
  return {
    text: [
      id + ' ranks #' + (rank + 1) + ' of ' + m.fullSummary.length + ' by house win (' + cash(x.win) + ' over ' + n(x.days) + ' days on the floor).',
      flags.length ? 'Review flags: ' + flags.join(', ') + '. Suggested action: ' + m.reviewAction(x) + '.' : 'It crosses no review threshold. Suggested action: ' + m.reviewAction(x) + '.',
      'Payout gap ' + pp(x.res) + ', availability ' + pct(x.availability, 1) + ', play vs local peers ' + pct(x.local, 0) + '.',
      (a => a?.adjRank ? 'Adjusted for exposure, luck and placement it ranks #' + a.adjRank + ' of ' + m.fullRanking.ordered.length + ', earning ' + pct(a.index, 0) + ' of matched peers’ expected win per hour.' : 'It has no matched-peer benchmark for the adjusted ranking.')(m.fullRanking.rows.find(r => r.id === id)),
      ...(id === m.inspect.id ? ['It kept ' + cash(x.theo - x.win) + ' less than its settings imply, a shortfall too persistent to be luck, so the July plan funds a ' + cash(m.inspectionCost) + ' meter and paytable inspection.'] : []),
      ...(id === m.move.id ? ['Its move to a busier bank is deferred: only ' + m.moveCases.filter(r => r.main.bankPct > 0).length + ' of ' + m.moveCases.length + ' past moves gained across both affected banks, so displaced play is a real risk.'] : []),
    ],
    items: [{ label: id + ' machine file', value: cash(x.win), summary: 'Monthly win, payout check and placement for this cabinet.', go: { evidence: id } }],
    focus: { ids, label: id },
  };
}

/** Scores evidence-map boxes against the question's words when no specific topic matched. */
function searchNodes(text, graph) {
  const qw = words(text);
  if (!qw.length) return [];
  return graph.nodes
    .filter(nd => ['evidence', 'action', 'source', 'decision'].includes(nd.type))
    .map(nd => {
      const hay = words(nd.label + ' ' + nd.summary);
      const label = words(nd.label);
      const score = qw.reduce((s, w) => s + (label.some(h => h.startsWith(w) || w.startsWith(h)) ? 3 : hay.some(h => h.startsWith(w)) ? 1 : 0), 0);
      return { nd, score };
    })
    .filter(r => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(r => r.nd);
}

const item = nd => ({ label: nd.label, value: nd.value, summary: nd.summary, go: nd.go });
const related = (graph, nd, type) => [...nd.nb].map(id => graph.byId.get(id)).filter(o => o.type === type);

export const SUGGESTIONS = ['Tell me everything about Q2/Q3', 'Why inspect M-1158?', 'What did past moves show?', 'How good is the forecast?', 'What does the July plan fund?', 'Tell me about M-1181'];

export function answer(text, graph, m) {
  const t = text.toLowerCase().trim();
  if (!t || /^(hi|hello|hey|help|what can you do)\b/.test(t)) {
    return {
      text: ['I can walk you through any part of the dashboard: a question tab (Q1–Q6), a machine (e.g. M-1158), an action like the inspection or the move, or where the data comes from. I’ll point at the matching boxes on the Evidence map.'],
      items: [], focus: null, suggestions: SUGGESTIONS,
    };
  }

  const machine = t.match(/\bm-?\s?(\d{4})\b/);
  if (machine) return machineAnswer('M-' + machine[1], m);

  if (/\bdata\b|source|where does|come from|dataset/.test(t)) {
    const sources = graph.nodes.filter(nd => nd.type === 'source');
    return {
      text: ['Everything on the dashboard is computed from ' + sources.length + ' data sources: ' + (sources.length - REAL_SOURCES.length) + ' from the TAMU Datathon challenge (synthetic January–June 2025 casino data) and ' + REAL_SOURCES.length + ' real public sources used only as context (LVCVA visitor counts, NOAA weather and the Missouri Gaming Commission slot benchmark).'],
      items: sources.map(item), focus: { ids: sources.map(s => s.id), label: 'Data sources' },
    };
  }

  // A question tab, or several: "everything about Q2/Q3" maps to one group.
  const qids = QUESTION_PATTERNS.filter(([, re]) => re.test(t)).map(([id]) => id);
  if (qids.length) {
    const text = [], items = [], ids = [];
    for (const qid of qids.slice(0, 2)) {
      const q = graph.byId.get(qid);
      const evidence = related(graph, q, 'evidence');
      const actions = [...new Set(evidence.flatMap(ev => related(graph, ev, 'action')))];
      text.push(q.label + ': ' + q.summary);
      text.push(...questionFacts(qid, m));
      if (actions.length) text.push('This evidence supports: ' + actions.map(a => a.label).join(', ') + '.');
      else text.push('This evidence is context for the plan rather than the basis for a specific July action.');
      items.push(...evidence.map(item));
      ids.push(qid, ...evidence.map(ev => ev.id));
    }
    return { text, items, focus: { ids, label: qids.map(id => graph.byId.get(id).label).join(' + ') } };
  }

  const hits = searchNodes(t, graph);
  if (hits.length) {
    const top = hits[0];
    const text = [top.label + (top.value ? ' (' + top.value + ')' : '') + ': ' + top.summary];
    const up = related(graph, top, { evidence: 'source', action: 'evidence', decision: 'action' }[top.type]);
    const down = related(graph, top, { source: 'evidence', evidence: 'action', action: 'decision' }[top.type]);
    if (up.length) text.push('It is built from ' + up.map(o => o.label).join(', ') + '.');
    if (down.length) text.push('It feeds into ' + down.map(o => o.label).join(', ') + '.');
    return { text, items: hits.map(item), focus: { ids: hits.map(h => h.id), label: top.label } };
  }

  return {
    text: ['I couldn’t match that to anything on the dashboard. Try a question tab (Q1–Q6), a machine id like M-1158, or a topic such as downtime, comps, the forecast, past moves or the July budget.'],
    items: [], focus: null, suggestions: SUGGESTIONS,
  };
}
