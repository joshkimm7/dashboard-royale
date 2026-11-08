// Demand → Response times: how fast fault tickets are answered and repaired, whether response is slower with fewer
// technicians on duty (like-for-like test), and which downtime a technician shift or preventive maintenance could avoid.
import { useModel } from '../modelContext.js';
import { Chart, How, Line, Note, Panel, Table, Takeaway } from '../components/ui.jsx';
import { SERIES, by, cash, month, months, n, pct, ratio } from '../lib/format.js';
import { SHIFT_HOURS, SHIFT_NAMES, avoidable, makeRates, responseStats, rosterRows, scopeTickets } from '../lib/downtime.js';

const minutes = v => v == null || !Number.isFinite(v) ? '—' : n(v, 0) + ' min';
const hours = v => n(v, 1) + ' h';
const pValue = p => p < .001 ? 'p < 0.001' : 'p = ' + n(p, 3);
const gap = t => minutes(t.mean1 - t.mean2) + ' (' + n(t.lo, 0) + ' to ' + n(t.hi, 0) + ')';

export default function DemandResponse({ scope: s }) {
  const { data, downtime: f } = useModel();
  const tickets = scopeTickets(f.tickets, s);
  const roster = rosterRows(data).filter(r => r.d >= s.start && r.d <= s.end);
  const all = responseStats(tickets);
  const [dayTest, swingTest] = f.tests;
  const graveWait = responseStats(f.tickets.filter(t => t.shift === 2)).response;
  const repairOne = responseStats(f.tickets.filter(t => t.techs === 1)).repair, repairTwo = responseStats(f.tickets.filter(t => t.techs === 2)).repair;

  const shiftRows = [0, 1, 2].flatMap(shift => [...by(roster.filter(r => r.shift === shift), r => r.techs).entries()].sort((a, b) => a[0] - b[0]).map(([techs, days]) => {
    const st = responseStats(tickets.filter(t => t.shift === shift && t.techs === techs));
    return [SHIFT_NAMES[shift] + ' · ' + SHIFT_HOURS[shift], n(techs), n(days.length), n(st.n), n(ratio(st.n, days.length), 2), minutes(st.response), minutes(st.responseMedian), pct(st.immediate, 0), minutes(st.repair)];
  }));
  const rates = makeRates(tickets, s.rows);
  const byMonth = [...by(tickets, t => month(data.dates[t.d])).entries()].sort((a, b) => a[0] - b[0]).map(([m, g]) => ({ m, ...responseStats(g),
    short: roster.filter(r => month(data.dates[r.d]) === m && r.techs < r.planned).length }));
  const av = avoidable(tickets, s.rows, f.share.share);

  return (
    <>
      <Panel title="How fast are faults answered?" id="response-check">
        <Takeaway>{'With one technician on duty, faults wait longer for work to start. On weekday day shifts the mean wait was ' + minutes(dayTest.mean1) + ' with one technician against ' + minutes(dayTest.mean2) +
          ' with two; on swing shifts ' + minutes(swingTest.mean1) + ' against ' + minutes(swingTest.mean2) + '. Grave shifts always had one technician and averaged ' + minutes(graveWait) +
          '. Once work starts, repairs took ' + minutes(repairOne) + ' on average with one technician and ' + minutes(repairTwo) + ' with two. January–June, whole floor.'}</Takeaway>
        <Line label="Fault tickets opened" value={n(all.n)} />
        <Line label="Response · mean / median" value={minutes(all.response) + ' / ' + minutes(all.responseMedian)} />
        <Line label="Work started at once" value={pct(all.immediate, 0)} />
        <Line label="Repair · mean / median" value={minutes(all.repair) + ' / ' + minutes(all.repairMedian)} />
        <Table headers={['Vegas shift', 'Techs on duty', 'Shift-days', 'Tickets', 'Tickets per shift-day', 'Mean response', 'Median response', 'Started at once', 'Mean repair']} rows={shiftRows} />
        <Note>Techs on duty come from the slot-technician roster (actual headcount for the shift the ticket opened in). Selected months and bank.</Note>
        <h3>Like-for-like test · same shift, one technician vs two</h3>
        <Table headers={['Comparison', 'One tech · tickets (shift-days)', 'Two techs · tickets (shift-days)', 'Mean response, one vs two', 'Gap and 95% interval (min)', 'Permutation test', 'Tickets per shift-day, one vs two']}
          rows={[...f.tests, ...f.robust].map(t => [t.label, n(t.n1) + ' (' + n(t.days1) + ')', n(t.n2) + ' (' + n(t.days2) + ')', minutes(t.mean1) + ' vs ' + minutes(t.mean2), gap(t), pValue(t.p), n(t.load1, 2) + ' vs ' + n(t.load2, 2)])} />
        <Note>{'Short-staffed days were not busier on the day shift (' + n(dayTest.load1, 2) + ' vs ' + n(dayTest.load2, 2) + ' tickets per shift-day), so load does not explain that gap. Swing shortage days had more tickets (' + n(swingTest.load1, 2) + ' vs ' + n(swingTest.load2, 2) +
          '), so part of the swing gap may be load. Pooled, a second technician removed ' + pct(f.share.share, 0) + ' of the waiting (95% interval ' + pct(f.share.lo, 0) + ' to ' + pct(f.share.hi, 0) + ').'}</Note>
        <How>{'Response = ticket opened (machine unavailable) to work started; repair = work started to machine available again. Each ticket is matched to the slot-technician roster row whose UTC window contains its opening, so techs on duty is the actual headcount for that shift. Only like shifts are compared: weekday day shifts (weekends are planned with one technician) and swing shifts, April–June, when the one-technician days occurred, so season and weekday mix match; the January–June rows repeat the test as a check. Intervals come from 10,000 bootstrap resamples of tickets; the permutation test shuffles the staffing label 10,000 times (one-sided). The pooled share weights each comparison by its one-technician tickets. The test cards are full period and whole floor; the tables above follow the filters. Shortages were not random, so an unmeasured cause of both short staffing and slow response cannot be ruled out.'}</How>
      </Panel>

      <Panel title="Response and repair by manufacturer">
        <Table headers={['Manufacturer', 'Tickets', 'Faults per 1,000 machine-days', 'Repeat within 14 days', 'Mean response', 'Mean repair', 'Mean repair bill']}
          rows={rates.map(r => [r.make, n(r.tickets), n(1000 * r.rate, 1), pct(r.repeat, 0), minutes(r.response), minutes(r.repair), cash(r.cost)])} />
        <Note>Repeat = the same machine failed again within 14 days of being restored. A high fault and repeat rate with ordinary repair times points to a reliability problem that maintenance could target, not to slow technicians.</Note>
      </Panel>

      <Panel title="Response and repair by month">
        <Chart title="Response and repair by month" labels={byMonth.map(r => months[r.m])} format={v => n(v, 0) + ' min'} height={220} markers min={0}
          series={[{ name: 'Mean response (minutes)', color: SERIES.gold, values: byMonth.map(r => r.response) }, { name: 'Mean repair (minutes)', color: SERIES.blue, dash: '7 5', values: byMonth.map(r => r.repair) }]} />
        <Table headers={['Month', 'Tickets', 'Mean response', 'Median response', 'Mean repair', 'Short-staffed technician shifts']}
          rows={byMonth.map(r => [months[r.m], n(r.n), minutes(r.response), minutes(r.responseMedian), minutes(r.repair), n(r.short)])} />
        <Note>Short-staffed = fewer technicians worked than were planned for that shift.</Note>
      </Panel>

      <Panel title="Which downtime could be avoided?">
        <Takeaway>{'Of ' + hours(av.meter) + ' of meter downtime, a second technician on lone-technician shifts could plausibly avoid about ' + hours(av.tech) + ' (' + pct(ratio(av.tech, av.meter), 0) + ') and preventive maintenance at most ' +
          hours(av.pm) + ' (' + pct(ratio(av.pm, av.meter), 0) + '). Together, without double counting, ' + pct(ratio(av.either, av.meter), 0) + '; the rest is repair work neither action shortens.'}</Takeaway>
        <Line label="Meter downtime" value={hours(av.meter)} />
        <Line label="Fault-ticket hours · waiting / repair" value={hours(av.fault) + ' · ' + hours(av.wait) + ' / ' + hours(av.repair)} />
        <Line label="Technician shift could avoid" value={hours(av.tech) + ' · ' + n(av.lone) + (av.lone === 1 ? ' lone-technician ticket' : ' lone-technician tickets')} />
        <Line label="Preventive maintenance could avoid · upper bound" value={hours(av.pm)} />
        <Line label="Either action, overlap counted once" value={hours(av.either) + ' (overlap ' + hours(av.overlap) + ')'} />
        <Note>{'Fault tickets never overlap on the same machine, so ticket hours add up without double counting. Floor-wide they do overlap in time: up to ' + n(f.overlap.maxOpen) + ' faults were open at once, which is what queues work behind a lone technician. Over January–June, fault tickets explain ' +
          hours(f.overlap.faultHours) + ' of ' + hours(f.overlap.meterHours) + ' meter downtime; moves, installs and scheduled maintenance explain the other ' + hours(f.overlap.otherHours) + '.'}</Note>
        <How>{'Technician: the waiting on tickets opened while one technician (or none) was on duty, times the ' + pct(f.share.share, 0) + ' of waiting a second technician removed in the like-for-like test; shifts already staffed with two are assumed to gain nothing. Preventive maintenance: for each manufacturer whose fault rate per machine-day exceeds the other makes combined, all hours of its tickets above that rate, as if a sweep brought it level; that is a best case, since no sweep outcome is recorded. Overlap = the lone-technician waiting on those excess tickets, removed once. Repair time after work starts is out of reach of both. Selected months and bank.'}</How>
      </Panel>
    </>
  );
}
