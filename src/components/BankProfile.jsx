// Bank profile: a one-panel drill-down shown at the top of Machine audit and Demand & uptime when a bank is selected.
// Machines (with links to their machine files), demand per available hour against the floor, downtime, a monthly trend,
// the bank's slot positions and its zone's April→June context from Demand → Zones & context.
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { SERIES, by, cash, month, months, n, pct, ratio, signedPct, sum } from '../lib/format.js';
import { zoneTraffic } from '../lib/zones.js';
import { Chart, Line, Note, Panel, Takeaway } from './ui.jsx';

const rate = rows => ratio(sum(rows, r => r.coin), sum(rows, r => r.h));
const slotNumber = slot => Number(slot.split('-').at(-1));

export default function BankProfile({ scope: s }) {
  const m = useModel();
  const nav = useNav();
  const bank = s.bank;
  if (!bank) return null;
  const zone = m.bankZone[bank];
  const rows = s.rows;
  const floor = m.scope({ from: s.from, to: s.to, bank: '' }).rows;
  const machines = [...by(rows, r => r.id).entries()].map(([id, g]) => ({ id, win: sum(g, r => r.win) })).sort((a, b) => a.win - b.win);
  const bottomTen = new Set(m.fullSummary.slice(0, 10).map(x => x.id));
  const bankRate = rate(rows), floorRate = rate(floor);
  const down = sum(rows, r => r.down), hours = sum(rows, r => r.h);

  // Slot positions at the end of the selection: the machine on each slot on the bank's last reported day.
  const lastDay = rows.length ? Math.max(...rows.map(r => r.d)) : null;
  const slots = new Map();
  for (const r of rows) if (r.slot && (!slots.has(r.slot) || r.d >= slots.get(r.slot).d)) slots.set(r.slot, r);
  const positions = [...slots.values()].sort((a, b) => slotNumber(a.slot) - slotNumber(b.slot))
    .map(r => ({ slot: r.slot, id: r.d === lastDay ? r.id : null }));

  // Monthly coin-in per available hour, bank against the whole floor.
  const monthsIn = [...new Set(floor.map(r => month(m.data.dates[r.d])))].sort((a, b) => a - b);
  const byMonth = list => monthsIn.map(mo => rate(list.filter(r => month(m.data.dates[r.d]) === mo)));

  // Zone context (P4): full floor, April → June, from the same zone decomposition and traffic counts as Demand → Zones & context.
  const zc = m.zoneFinding.contribution.zones.find(r => r.zone === zone);
  const traffic = zoneTraffic(m.data.zoneTraffic, m.data.dates, 0, m.fullDays - 1);
  const entriesChange = (t => t.get(zone, 3) && t.get(zone, 5) ? t.get(zone, 5).perDay / t.get(zone, 3).perDay - 1 : null)(traffic);
  const signedCash = v => (v > 0 ? '+' : '') + cash(v);

  return (
    <Panel title={'Bank profile · ' + bank} id="bank-profile">
      <Takeaway>{bank + ' sits in ' + m.zones[zone] + '. In the selected months it took ' + cash(bankRate) + ' per available machine-hour, ' +
        pct(ratio(bankRate, floorRate), 0) + ' of the floor’s ' + cash(floorRate) + '.'}</Takeaway>
      <div className="grid split">
        <div>
          <Line label="Machines in the bank" value={n(machines.length) + ' in the selected months · ' + n(positions.length) + ' slots'} />
          <Line label="Coin-in per available hour vs floor" value={cash(bankRate) + ' vs ' + cash(floorRate) + ' (' + pct(ratio(bankRate, floorRate), 0) + ')'} />
          <Line label="Bank downtime" value={n(down, 1) + ' h · ' + pct(ratio(hours, hours + down), 1) + ' available · ' + cash(sum(rows, r => r.lost)) + ' coin-in at risk'} />
          <Line label="Zone change · April to June" value={zc ? signedCash(zc.change) + ' coin-in per day · ' + signedPct(zc.b.rate / zc.a.rate - 1) + ' per available hour · ' + signedPct(entriesChange) + ' entries per day' : '—'} />
          <p className="muted">Machines, lowest house win first. ◆ marks a full-period bottom-ten cabinet. Open a machine file:</p>
          <div className="bank-machines">
            {machines.map(x => (
              <button key={x.id} data-machine={x.id} onClick={() => nav.openMachine(x.id)} aria-label={'Open ' + x.id + ' machine file' + (bottomTen.has(x.id) ? ', bottom-ten cabinet' : '')}>
                {(bottomTen.has(x.id) ? '◆ ' : '') + x.id}
              </button>
            ))}
          </div>
          <p className="muted">{'Slot positions on ' + (lastDay != null ? m.data.dates[lastDay] : '—') + ', the last day in the selection:'}</p>
          <ol className="slot-strip" aria-label={'Slots in ' + bank + ' by position'}>
            {positions.map(p => (
              <li key={p.slot} className={p.id ? '' : 'vacant'}><small>{'#' + slotNumber(p.slot)}</small><span>{p.id ?? 'Vacant'}</span></li>
            ))}
          </ol>
        </div>
        <div>
          <Chart title="Bank demand trend" labels={monthsIn.map(mo => months[mo])} format={v => cash(v)} height={190} markers
            series={[{ name: 'Bank ' + bank, color: SERIES.gold, values: byMonth(rows) }, { name: 'Whole floor', color: SERIES.muted, dash: '6 4', muted: true, values: byMonth(floor) }]} />
          <Note>{'Coin-in per available machine-hour by month. Zone change is the whole ' + m.zones[zone] + ' zone, full floor, April to June, as in Zones & context.'}</Note>
          <button onClick={() => nav.jump('zones-check')}>{'See ' + m.zones[zone] + ' in Zones & context →'}</button>
        </div>
      </div>
    </Panel>
  );
}
