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
# Guide §5: rows with no location are days before installation or after retirement (1,018 in release 0.9.0-draft).
# They are excluded, never counted as zero sales; every retained row is a placed machine-day.
off_floor = daily.location_id.isna()
print(f'Excluded {int(off_floor.sum()):,} off-floor machine-days and {int((~off_floor & daily.meter_status.ne("reported")).sum()):,} unreported meter days')
daily = daily[~off_floor & daily.meter_status.eq('reported')].copy()
assert daily.location_id.notna().all() and (daily.available_hours >= 0).all()
cal = load('calendar_day')
daily = daily.merge(cal[['gaming_date', 'scheduled_seconds']], on='gaming_date', validate='many_to_one')
daily['scheduled'] = daily.scheduled_seconds / 3600
daily['down'] = (daily.scheduled - daily.available_hours).clip(lower=0)
assert (daily.available_hours <= daily.scheduled + 0.001).all()
assert np.allclose(daily.coin_in_usd - daily.payout_usd, daily.house_win_usd)
assert np.allclose(daily.coin_in_usd * (1-daily.configured_rtp), daily.theo_usd)

# Payout-configuration check: compare every placed day's configured RTP with the published game math, and look for
# machines whose configuration changed mid-period in the daily view, the raw meters or the placement history.
game_math = load('game_math')
placements = load('placements')
meters = load('machine_day')[['machine_id','gaming_date','config_id','coin_in_cents','theo_cents','sum_bet_squared']]
published = game_math.set_index('config_id')
daily_rtp = daily.config_id.map(published.configured_rtp)
rtp_mismatch = daily[daily_rtp.isna() | (daily.configured_rtp - daily_rtp).abs().gt(1e-9)]
placed_meters = meters.merge(daily[['machine_id','gaming_date','config_id']], on=['machine_id','gaming_date'],
                             suffixes=('', '_daily'), validate='one_to_one')
meter_rtp = placed_meters.config_id.map(published.configured_rtp)
# Raw meters imply an RTP through theo = coin-in x (1 - RTP); a different implied rate is a lead to inspect.
implied_gap = (placed_meters.theo_cents - placed_meters.coin_in_cents * (1 - meter_rtp)).abs()
meter_mismatch = placed_meters[placed_meters.config_id.ne(placed_meters.config_id_daily) | meter_rtp.isna() | implied_gap.gt(1)]
def changed(frame):
    counts = frame.groupby('machine_id').config_id.nunique()
    return [[machine, ' → '.join(frame.loc[frame.machine_id.eq(machine), 'config_id'].drop_duplicates())]
            for machine in counts.index[counts > 1]]
payout_config = {
    'configs': int(len(game_math)), 'machineDays': int(len(daily)), 'machines': int(daily.machine_id.nunique()),
    'placements': int(len(placements)),
    'rtpMismatches': [[k[0], k[1], float(k[2]), int(len(g))] for k, g in
                      rtp_mismatch.groupby(['machine_id','config_id','configured_rtp'])],
    'meterMismatches': [[machine, int(len(g))] for machine, g in meter_mismatch.groupby('machine_id')],
    'dailyChanges': changed(daily.sort_values('gaming_date')),
    'placementChanges': changed(placements.sort_values('effective_from_utc')),
}
print('Payout-config check:', {k: (len(v) if isinstance(v, list) else v) for k, v in payout_config.items()})
# Spin-level luck: payout variance per spin is the game's multiplier variance times the bet squared (cents² → dollars²).
daily = daily.merge(placed_meters[['machine_id','gaming_date','sum_bet_squared']], on=['machine_id','gaming_date'], validate='one_to_one')
daily['luck_var'] = daily.config_id.map(published.payout_multiplier_variance) * daily.sum_bet_squared / 1e4
assert daily.luck_var.notna().all()

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
# Fit calendar adjustments on the same training period as the frozen weekday model.
events = load('events')
def event_known(day):
    return events[(events.announced_date < day) & (events.start_date <= day) & (events.end_date >= day)]
def calendar_flags(day, holiday):
    return [bool(holiday), not event_known(day).empty]

holidays = cal.set_index('gaming_date').federal_holiday.fillna('').to_dict()
flags = np.asarray([calendar_flags(day, holidays.get(day)) for day in props.gaming_date], dtype=float)
training_flags = flags[train]
residual = props.loc[train, 'coin_in_usd'] - props.loc[train, 'weekday_pred']
# Four pseudo-observations at zero shrink effects from sparse flagged dates.
coefficients = np.linalg.solve(training_flags.T @ training_flags + 4 * np.eye(2), training_flags.T @ residual)
props['calendar_pred'] = props.weekday_pred + flags @ coefficients
props['holiday_known'] = props.gaming_date.map(holidays)
props['event_known'] = flags[:, 1].astype(bool)

holdout = props.loc[~train]
def paired_errors(sample, challenger, baseline):
    gap = ((sample.coin_in_usd - sample[baseline]).abs()
           - (sample.coin_in_usd - sample[challenger]).abs()).to_numpy()
    rng = np.random.default_rng(2025)
    starts = rng.integers(0, len(gap), (10000, (len(gap) + 6) // 7))
    indices = ((starts[:, :, None] + np.arange(7)) % len(gap)).reshape(len(starts), -1)[:, :len(gap)]
    return {
        'days': len(gap), 'wins': int((gap > .005).sum()),
        'ties': int((np.abs(gap) <= .005).sum()), 'maeGap': float(gap.mean()),
        'interval': np.quantile(gap[indices].mean(axis=1), [.025, .975]).tolist(),
    }

validation = {
    'frozen': paired_errors(holdout, 'weekday_pred', 'last_week_pred'),
    'calendar': paired_errors(holdout, 'calendar_pred', 'weekday_pred'),
    'expanding': paired_errors(props.loc[props.gaming_date >= '2025-03-01'],
                               'expanding_weekday_pred', 'last_week_pred'),
    'trainingFlagDays': training_flags.sum(axis=0).astype(int).tolist(),
    'effects': coefficients.tolist(),
}

# Match each event and follow-up date to event-free dates in the same month and weekday.
money_columns = ['coin_in_usd', 'theo_usd']
controls = props.loc[props.events_active.isna()].copy()
controls['month'] = controls.gaming_date.str[:7]
assert not controls.gaming_date.duplicated().any()

def matched_promotion_window(start, end, exclude_window=False):
    selected = props.loc[props.gaming_date.between(start.date().isoformat(), end.date().isoformat())]
    assert len(selected) == (end - start).days + 1
    reference = controls
    if exclude_window:
        reference = controls.loc[~controls.gaming_date.isin(selected.gaming_date)]
    promotion_controls = reference.groupby(['month', 'local_weekday'])[money_columns].agg(['mean', 'size'])
    deltas = np.zeros(len(money_columns))
    counts = []
    for day in selected.itertuples():
        match = promotion_controls.loc[(day.gaming_date[:7], day.local_weekday)]
        counts.append(int(match[('coin_in_usd', 'size')]))
        for i, column in enumerate(money_columns):
            deltas[i] += getattr(day, column) - match[(column, 'mean')]
    return {'days': len(selected), 'coin': float(deltas[0]), 'theo': float(deltas[1]),
            'minControls': min(counts)}

promotions = []
for event in events.loc[events.event_type.eq('property_promotion')].itertuples():
    start, end = pd.Timestamp(event.start_date), pd.Timestamp(event.end_date)
    promotions.append({
        'name': event.name, 'start': event.start_date, 'end': event.end_date,
        'during': matched_promotion_window(start, end),
        'after': matched_promotion_window(end + pd.Timedelta(days=1), end + pd.Timedelta(days=7), exclude_window=True),
    })

# Inspection window uses the cabinet's own fully available, non-event and non-holiday hours.
hour_path, = (repo / 'data').rglob('machine_hour.csv.gz')
columns_hour = ['machine_id', 'hour_start_local', 'gaming_date', 'available_seconds', 'coin_in_cents']
hourly = pd.concat([chunk.loc[chunk.machine_id.eq('M-1158')]
                    for chunk in pd.read_csv(hour_path, usecols=columns_hour, chunksize=150000)],
                   ignore_index=True)
excluded = set(props.loc[props.events_active.notna(), 'gaming_date']) | {d for d,h in holidays.items() if h}
hourly = hourly[hourly.available_seconds.eq(3600) & ~hourly.gaming_date.isin(excluded)].copy()
hourly['local'] = pd.to_datetime(hourly.hour_start_local)
hourly['weekday'] = hourly.local.dt.dayofweek
hourly['hour'] = hourly.local.dt.hour
hourly['date'] = hourly.local.dt.date
starts_in_shift = hourly[hourly.weekday.lt(5) & hourly.hour.between(8, 18)]
partners = hourly[['date','hour','coin_in_cents']].copy()
partners['hour'] -= 1
windows = starts_in_shift.merge(partners, on=['date','hour'], suffixes=('', '_next'), validate='one_to_one')
# machine_hour stores cents; convert once here so everything downstream is dollars.
windows['coin'] = (windows.coin_in_cents + windows.coin_in_cents_next)/100
profile = windows.groupby(['weekday','hour']).coin.agg(['mean','size'])
profile = profile[profile['size'] >= 8]
weekday_means = profile.groupby(level='weekday')['mean'].mean()
july = pd.date_range('2025-07-02','2025-07-30')
options = [(day, hour, float(sample['mean']), int(sample['size'])) for day in july
           if day.dayofweek < 5 and day.day != 4 and event_known(day.date().isoformat()).empty
           for (weekday, hour), sample in profile.iterrows() if weekday == day.dayofweek]
# Avoid delaying a potentially valuable correction just to save a few dollars of interruption.
quietest = min(options, key=lambda v: (v[2], v[0], v[1]))
slot_day, slot_hour, slot_coin, slot_n = min(options, key=lambda v: (v[0], v[2], v[1]))
inspection_window = {'date':slot_day.date().isoformat(), 'weekday':slot_day.day_name(),
    'hour':int(slot_hour), 'coin':slot_coin, 'typical':float(weekday_means[slot_day.dayofweek]), 'n':slot_n,
    'quietestDate':quietest[0].date().isoformat(), 'quietestCoin':quietest[2],
    'waitDays':(quietest[0]-slot_day).days}
july_flags = []
for day in pd.date_range('2025-07-01','2025-07-30'):
    date = day.date().isoformat()
    known = event_known(date)
    holiday = 'Independence Day' if day.day == 4 else ''
    if holiday or not known.empty:
        july_flags.append([date, holiday, ', '.join(known.name)])
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
columns = ['day','machine_id','bank_id','zone_id','config_id','theme','volatility_class','manufacturer','available_hours','down','coin_in_usd','house_win_usd','theo_usd','floor_rate','zone_rate','zone_peer','lost_coin','lost_theo','contribution_after_supplied_costs_usd','location_id','occupied_hours']
# Integer-code repeated strings to keep the offline file small.
dictionaries = {}
for col in columns[1:8] + ['location_id']:
    indexes, values = pd.factorize(daily[col], sort=True)
    daily[col] = indexes
    dictionaries[col] = values.tolist()
# Luck variance aggregated to machine x month x bank (dictionary codes), so the funnel honours period and bank filters.
daily['month_index'] = daily.gaming_date.str[5:7].astype(int) - 1
luck = daily.groupby(['machine_id','month_index','bank_id'], as_index=False).luck_var.sum()
configs = game_math.assign(volatility=game_math.volatility_class)
data = {
    'revision': subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),
    'dates': dates, 'moves': moves, 'dicts': dictionaries, 'daily': rows(daily, columns),
    'validation': validation, 'promotions': promotions, 'inspectionWindow': inspection_window, 'julyFlags': july_flags,
    'property': rows(props, ['gaming_date','local_weekday','events_active','coin_in_usd','house_win_usd','theo_usd','entrance_zone_entries_observed','counter_coverage_share','comp_face_value_usd','comp_cost_usd','weekday_pred','base_pred','last_week_pred','expanding_weekday_pred','calendar_pred','holiday_known','event_known']),
    'players': rows(players, ['person','month','home_region','opening_tier','tracked_coin_in_usd','tracked_payout_usd','tracked_net_usd','comp_face_value_usd','comp_cost_usd','theo_usd'], 2),
    'locations': rows(locations[locations.node_type.isin(['bank','zone'])], ['location_id','node_type','zone_id','name','x_m','y_m']),
    'vacancies': rows(locations[locations.node_type.eq('slot') & ~locations.location_id.isin(daily.loc[daily.day.eq(len(dates)-1),'location_id'].map(dict(enumerate(dictionaries['location_id']))))], ['location_id','bank_id','zone_id']),
    'shifts': rows(shift_parts, ['day','bank','shift','hours','wait']),
    'city': rows(city, ['month','mean_visitors_per_calendar_day','source_url']),
    'events': rows(events, ['name','start_date','end_date','local_scope']),
    'payoutConfig': payout_config,
    'configs': rows(configs, ['config_id','configured_rtp','volatility','payout_multiplier_variance']),
    'luck': rows(luck, ['machine_id','month_index','bank_id','luck_var'], 1),
    'actions': rows(actions, ['action_type_id','name','unit_cost_cents','recurring_cost_cents_per_day','lead_days','downtime_minutes','quantity_limit']),
}
payload = json.dumps(data, separators=(',',':'), ensure_ascii=False, allow_nan=False).replace('</','<\\/')
# The React app (npm run build) inlines this file into dist/index.html; `npm run dev` serves it as /data.json.
(project/'data').mkdir(exist_ok=True)
(project/'data'/'dashboard.json').write_text(payload)
