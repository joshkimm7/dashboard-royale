"""Prepare the official release for the portable Dashboard Royale HTML."""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

parser = argparse.ArgumentParser()
parser.add_argument('repo', type=Path)
args = parser.parse_args()
repo = args.repo.resolve()
project = Path(__file__).resolve().parent

def load(name):
    path, = (repo / 'data').rglob(f'{name}.csv.gz')
    return pd.read_csv(path)

def rows(frame, columns, precision=5):
    return json.loads(frame[columns].round(precision).to_json(orient='values'))

daily = load('prepared_daily_view')
daily = daily[daily.location_id.notna() & daily.meter_status.eq('reported')].copy()
cal = load('calendar_day')
daily = daily.merge(cal[['gaming_date', 'scheduled_seconds']], on='gaming_date', validate='many_to_one')
daily['scheduled'] = daily.scheduled_seconds / 3600
daily['down'] = (daily.scheduled - daily.available_hours).clip(lower=0)
assert (daily.available_hours <= daily.scheduled + 0.001).all()
assert np.allclose(daily.coin_in_usd - daily.payout_usd, daily.house_win_usd)
assert np.allclose(daily.coin_in_usd * (1-daily.configured_rtp), daily.theo_usd)

def peer_rate(groups, min_peers):
    group = daily.groupby(groups)
    hours = group.available_hours.transform('sum') - daily.available_hours
    coin = group.coin_in_usd.transform('sum') - daily.coin_in_usd
    others = group.available_hours.transform('size') - 1
    return (coin / hours).where((hours > 0) & (others >= min_peers))

daily['floor_rate'] = peer_rate(['gaming_date','config_id'], 1)
zone_rate = peer_rate(['gaming_date','config_id','zone_id'], 4)
# For sparse zones, use only the prior 28 gaming days and exclude the focal cabinet.
def prior_totals(keys, values):
    grouped = daily.groupby(keys + ['gaming_date'], sort=True)[values].sum()
    days = cal.gaming_date
    index = pd.MultiIndex.from_frame(daily[keys + ['gaming_date']])
    def lagged(group):
        group = group.droplevel(keys).reindex(days, fill_value=0)
        return group.shift(1, fill_value=0).rolling(28, min_periods=1).sum()
    history = grouped.groupby(level=keys, group_keys=True).apply(lagged)
    return history.reindex(index).set_axis(daily.index)

daily['floor_coin'] = daily.floor_rate * daily.available_hours
keys = ['zone_id','config_id']
values = ['floor_coin','coin_in_usd']
pooled = prior_totals(keys, values) - prior_totals(keys + ['machine_id'], values)
pooled_rate = daily.floor_rate * (pooled.coin_in_usd / pooled.floor_coin).where(pooled.floor_coin >= 5000)
daily['zone_peer'] = np.select([zone_rate.notna(), pooled_rate.notna()], [2, 1], default=0)
daily['zone_rate'] = zone_rate.fillna(pooled_rate).fillna(daily.floor_rate)
# Exclude the affected day and use only fully available days for the same weekday.
daily['healthy_coin'] = daily.coin_in_usd.where(daily.down < .001, 0)
daily['healthy_hours'] = daily.available_hours.where(daily.down < .001, 0)
typical = daily.groupby(['machine_id','local_weekday'])
hours = typical.healthy_hours.transform('sum') - daily.healthy_hours
coin = typical.healthy_coin.transform('sum') - daily.healthy_coin
daily['recovery_rate'] = (coin / hours).where(hours >= 48).fillna(daily.zone_rate)
daily['lost_coin'] = (daily.down * daily.recovery_rate).fillna(0)
daily['lost_theo'] = daily.lost_coin * (1 - daily.configured_rtp)

props = load('property_day')
assert np.allclose(daily.groupby('gaming_date').coin_in_usd.sum(), props.coin_in_usd)
train = props.gaming_date < '2025-05-01'
props['weekday_pred'] = props.local_weekday.map(props[train].groupby('local_weekday').coin_in_usd.mean())
props['base_pred'] = props[train].coin_in_usd.mean()
assert pd.to_datetime(props.gaming_date).diff().iloc[1:].eq(pd.Timedelta(days=1)).all()
props['last_week_pred'] = props.coin_in_usd.shift(7)
props['expanding_weekday_pred'] = props.groupby('local_weekday').coin_in_usd.transform(
    lambda history: history.expanding().mean().shift(1))
dates = props.gaming_date.tolist()
daily['day'] = daily.gaming_date.map({d:i for i,d in enumerate(dates)})

players = load('player_period')
assert np.allclose(players.tracked_payout_usd - players.tracked_coin_in_usd, players.tracked_net_usd)
players['person'] = pd.factorize(players.player_id, sort=True)[0]
players['month'] = players.period_month.str[-2:].astype(int) - 1

# Allocate ticket duration across shifts by actual elapsed hour, using Vegas wall time for shift labels.
operations = load('operations')
ops = operations[operations.event_type.eq('fault_repair')].copy()
ops['opened'] = pd.to_datetime(ops.opened_at_utc, utc=True)
ops['restored'] = pd.to_datetime(ops.available_at_utc, utc=True)
ops['work'] = pd.to_datetime(ops.work_started_at_utc, utc=True)
limits = pd.to_datetime(cal.gaming_day_start_utc, utc=True)
end = pd.to_datetime(cal.gaming_day_end_utc.iloc[-1], utc=True)
slot = load('floor_locations').set_index('location_id')
shift_parts = []
for item in ops.itertuples():
    if pd.isna(item.restored):
        continue
    cursor = max(item.opened, limits.iloc[0])
    stop = min(item.restored, end)
    while cursor < stop:
        nxt = min(cursor.floor('h') + pd.Timedelta(hours=1), stop)
        local = cursor.tz_convert('America/Los_Angeles')
        day = (local.tz_localize(None) - pd.Timedelta(hours=6)).date().isoformat()
        shift = (local.hour - 6) % 24 // 8
        hours = (nxt-cursor).total_seconds()/3600
        waiting = max(0, (min(nxt,item.work)-cursor).total_seconds()/3600) if pd.notna(item.work) else 0
        shift_parts.append([day,slot.bank_id.get(item.location_id),shift,hours,waiting])
        cursor = nxt
shift_parts = pd.DataFrame(shift_parts, columns=['day','bank','shift','hours','wait'])
shift_parts = shift_parts.groupby(['day','bank','shift'],as_index=False)[['hours','wait']].sum()

# Event study. The move day itself is dropped, including any transport downtime.
def compare_move(machine, day, width):
    window = daily[daily.day.between(day - width, day + width) & daily.day.ne(day)].copy()
    window['after'] = window.day.gt(day)
    focal = window[window.machine_id.eq(machine)]
    if len(focal) != 2 * width or focal.config_id.nunique() != 1:
        return None
    origin, target = [focal[focal.after.eq(period)].bank_id.unique() for period in (False, True)]
    if len(origin) != 1 or len(target) != 1 or origin[0] == target[0]:
        return None
    affected = {origin[0], target[0]}
    stable = window.groupby('machine_id').agg(days=('day', 'nunique'), slots=('location_id', 'nunique'),
                                               configs=('config_id', 'nunique'))
    stable = stable.index[(stable.days == 2 * width) & (stable.slots == 1) & (stable.configs == 1)]
    control = window[window.machine_id.isin(stable) & window.config_id.eq(focal.config_id.iloc[0])
                     & ~window.bank_id.isin(affected)]
    if control.machine_id.nunique() < 3:
        return None

    def rates(frame, column='coin_in_usd', hourly=True):
        return [period[column].sum() / (period.available_hours.sum() if hourly else width)
                for period in (frame[~frame.after], frame[frame.after])]

    pre, post = rates(focal)
    cpre, cpost = rates(control)
    pair = window[window.bank_id.isin(affected)]
    # Use stable comparison banks in the same zone as each affected bank.
    other_movers = operations[operations.event_type.eq('move')].machine_id
    other_affected = window.loc[window.machine_id.isin(other_movers) & window.machine_id.ne(machine)
                                & ~window.machine_id.isin(stable), 'bank_id'].unique()
    change = []
    bank_controls = []
    theo_change = []
    for bank in (origin[0], target[0]):
        sample = pair[pair.bank_id.eq(bank)]
        zone = sample.zone_id.iloc[0]
        zone_controls = window[window.zone_id.eq(zone) & ~window.bank_id.isin(affected | set(other_affected))]
        bpre, bpost = rates(sample, hourly=False)
        zpre, zpost = rates(zone_controls, hourly=False)
        change.append(bpost - bpre * zpost / zpre if zpre else None)
        bank_controls.append(int(zone_controls.bank_id.nunique()))
        tpre, tpost = rates(sample, column='theo_usd', hourly=False)
        tzpre, tzpost = rates(zone_controls, column='theo_usd', hourly=False)
        theo_change.append(tpost - tpre * tzpost / tzpre if tzpre else None)
    net_change = sum(change) if all(value is not None for value in change) else None
    net_pct = net_change / rates(pair, hourly=False)[0] if net_change is not None else None
    prior = None
    if width == 14:
        first = focal[focal.day.lt(day-7)]
        second = focal[focal.day.ge(day-7) & ~focal.after]
        a = control[control.day.lt(day-7)]
        b = control[control.day.ge(day-7) & ~control.after]
        prior = (second.coin_in_usd.sum()/second.available_hours.sum()) / (first.coin_in_usd.sum()/first.available_hours.sum()) / ((b.coin_in_usd.sum()/b.available_hours.sum()) / (a.coin_in_usd.sum()/a.available_hours.sum())) - 1
    target_zone = focal.loc[focal.after,'zone_id'].iloc[0]
    pre_target = control[~control.after & control.zone_id.eq(target_zone)]
    target_rate = pre_target.coin_in_usd.sum() / pre_target.available_hours.sum() if pre_target.available_hours.sum() else None
    # Use the pre-move target rate gap and remove the change observed in control cabinets.
    gap = target_rate - pre if target_rate is not None else None
    rate_gain = post - pre * cpost / cpre
    capture = rate_gain / gap if gap is not None and gap > 0 else None
    fpre, fpost = rates(focal, column='theo_usd', hourly=False)
    tfpre, tfpost = rates(control, column='theo_usd')
    focal_gain = fpost - fpre * tfpost / tfpre
    pair_theo = sum(theo_change) if all(value is not None for value in theo_change) else None
    offset = 1 - pair_theo / focal_gain if pair_theo is not None and focal_gain > 0 else None
    return {'origin': origin[0], 'target': target[0], 'config': focal.config_id.iloc[0],
            'pre': pre, 'post': post, 'controlPre': cpre, 'controlPost': cpost,
            'cabinet': (post/pre)/(cpost/cpre)-1, 'controls': int(control.machine_id.nunique()),
            'bankChange': net_change, 'bankPct': net_pct, 'originChange': change[0], 'targetChange': change[1],
            'bankControls': bank_controls, 'pretrend': prior, 'preGap': gap, 'rateGain': rate_gain,
            'targetPeers': int(pre_target.machine_id.nunique()), 'capture': capture,
            'focalTheoGain': focal_gain, 'pairTheoGain': pair_theo, 'offset': offset}

moves = []
for ticket in operations[operations.event_type.eq('move')].itertuples():
    gaming_day = (pd.Timestamp(ticket.opened_at_local) - pd.Timedelta(hours=6)).date().isoformat()
    day = dates.index(gaming_day)
    moves.append({'id': ticket.machine_id, 'date': gaming_day,
                  'main': compare_move(ticket.machine_id, day, 14),
                  'short': compare_move(ticket.machine_id, day, 7)})

locations = load('floor_locations')
city = load('city_visitation_monthly')
actions = load('action_catalog')
events = load('events')
columns = ['day','machine_id','bank_id','zone_id','config_id','theme','volatility_class','manufacturer','available_hours','down','coin_in_usd','house_win_usd','theo_usd','floor_rate','zone_rate','zone_peer','lost_coin','lost_theo','contribution_after_supplied_costs_usd','location_id','occupied_hours']
# Integer-code repeated strings to keep the offline file small.
dictionaries = {}
for col in columns[1:8] + ['location_id']:
    indexes, values = pd.factorize(daily[col], sort=True)
    daily[col] = indexes
    dictionaries[col] = values.tolist()
data = {
    'revision': subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),
    'dates': dates, 'moves': moves, 'dicts': dictionaries, 'daily': rows(daily, columns),
    'property': rows(props, ['gaming_date','local_weekday','events_active','coin_in_usd','house_win_usd','theo_usd','entrance_zone_entries_observed','counter_coverage_share','comp_face_value_usd','comp_cost_usd','weekday_pred','base_pred','last_week_pred','expanding_weekday_pred']),
    'players': rows(players, ['person','month','home_region','opening_tier','tracked_coin_in_usd','tracked_payout_usd','tracked_net_usd','comp_face_value_usd','comp_cost_usd','theo_usd'], 2),
    'locations': rows(locations[locations.node_type.isin(['bank','zone'])], ['location_id','node_type','zone_id','name','x_m','y_m']),
    'vacancies': rows(locations[locations.node_type.eq('slot') & ~locations.location_id.isin(daily.loc[daily.day.eq(len(dates)-1),'location_id'].map(dict(enumerate(dictionaries['location_id']))))], ['location_id','bank_id','zone_id']),
    'shifts': rows(shift_parts, ['day','bank','shift','hours','wait']),
    'city': rows(city, ['month','mean_visitors_per_calendar_day','source_url']),
    'events': rows(events, ['name','start_date','end_date','local_scope']),
    'actions': rows(actions, ['action_type_id','name','unit_cost_cents','recurring_cost_cents_per_day','lead_days','downtime_minutes','quantity_limit']),
}
payload = json.dumps(data, separators=(',',':'), ensure_ascii=False, allow_nan=False).replace('</','<\\/')
template = (project/'dashboard.html').read_text()
(project/'dist'/'index.html').write_text(template.replace('/*__DATA__*/null',payload))
