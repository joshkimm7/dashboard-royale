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
meters = load('machine_day')[['machine_id','gaming_date','config_id','coin_in_cents','theo_cents','sum_bet_squared','paid_spins','payout_positive_spins']]
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
daily = daily.merge(placed_meters[['machine_id','gaming_date','sum_bet_squared','payout_positive_spins']], on=['machine_id','gaming_date'], validate='one_to_one')
assert daily.payout_positive_spins.le(daily.paid_spins).all()
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

# Q4 age band: one value per card holder from `players` (missing for some, shown as "Unknown"), joined to the
# person index after the player-month table is keyed, and shipped as one digit per person to stay small.
holders = load('players')[['player_id','age_band']].assign(age_band=lambda f: f.age_band.fillna('Unknown'))
person_ids = pd.Index(sorted(players.player_id.unique()))
assert holders.player_id.is_unique and person_ids.isin(holders.player_id).all()
age_bands = sorted(holders.age_band.unique())
assert len(age_bands) <= 10
age_codes = holders.set_index('player_id').age_band.reindex(person_ids).map({b: i for i, b in enumerate(age_bands)})
assert players.age_band.fillna('Unknown').eq(players.player_id.map(holders.set_index('player_id').age_band)).all()
player_age = {'bands': age_bands, 'codes': ''.join(map(str, age_codes.astype(int)))}

# Q4 concentration reference for the whole carded population: per-person totals first, then the top 1/10/20% shares
# and Gini of wagers and of gross losses among active players. The client recomputes these for any filter; the claims
# check compares its full-population result with this independent pandas calculation.
per_person = players.groupby('person').agg(coin=('tracked_coin_in_usd','sum'), net=('tracked_net_usd','sum'))
per_person = per_person[per_person.coin > 0]
def concentration(values):
    v = np.sort(values.to_numpy())[::-1]
    total, count = v.sum(), len(v)
    top = {f'top{q}': float(v[:int(np.ceil(count * q / 100))].sum() / total) for q in (1, 10, 20)}
    ascending = v[::-1]
    gini = float(2 * np.sum(np.arange(1, count + 1) * ascending) / (count * total) - (count + 1) / count)
    return {**top, 'gini': gini, 'players': int(count)}
concentration_ref = {'wagers': concentration(per_person.coin.round(2)),
                     'losses': concentration((-per_person.net).clip(lower=0).round(2))}
print('Concentration reference:', concentration_ref)

# Carded vs all play (guide §4.2): monthly machine meters for placed, reported machine-days, with the carded subset.
# Carded win can exceed total win for a machine-month when uncarded players won as a group on that machine.
carded = load('machine_day')
carded = carded[carded.location_id.notna() & carded.meter_status.eq('reported')].copy()
carded['month'] = carded.gaming_date.str[5:7].astype(int) - 1
carded['win'] = carded.coin_in_cents - carded.payout_cents
carded['carded_win'] = carded.carded_coin_in_cents - carded.carded_payout_cents
machine_months = carded.groupby(['month','machine_id'])[['win','carded_win']].sum()
machine_months['above'] = machine_months.carded_win > machine_months.win
carded_monthly = carded.groupby('month')[['coin_in_cents','payout_cents','theo_cents','carded_coin_in_cents','carded_payout_cents','carded_theo_cents']].sum() / 100
carded_monthly['machine_months'] = machine_months.groupby(level='month').size()
carded_monthly['machine_months_above'] = machine_months.groupby(level='month').above.sum()
carded_monthly = carded_monthly.reset_index()
assert np.allclose(carded_monthly.coin_in_cents.sum(), daily.coin_in_usd.sum())

# Q5 loyalty ledger: award and redemption totals per gaming day x home region x opening tier x tier at the event.
# Awards take the gaming day and wagers of the carded segment that earned them; redemptions use the Vegas
# 06:00-06:00 gaming day of the event. Economic cost equals the linked POS cogs, so it is counted once, here only.
def guide_path(name):
    path, = (repo / 'data').rglob(f'{name}.csv.gz')
    return path
ledger = pd.read_csv(guide_path('loyalty_ledger'), usecols=['player_id','event_at_utc','event_type','points_delta','tier_before','tier_after',
                                                             'face_value_cents','economic_cost_cents','source_segment_id'])
assert set(ledger.event_type) == {'award', 'redeem'}
segments = pd.read_csv(guide_path('sessions'), usecols=['session_segment_id','gaming_date','coin_in_cents','theo_cents'])
members = pd.read_csv(guide_path('players'), usecols=['player_id','home_region','opening_tier'])
awards = ledger[ledger.event_type.eq('award')].merge(segments, left_on='source_segment_id', right_on='session_segment_id',
                                                       how='left', validate='one_to_one')
assert awards.gaming_date.notna().all()
redeems = ledger[ledger.event_type.eq('redeem')].copy()
redeem_local = pd.to_datetime(redeems.event_at_utc, utc=True).dt.tz_convert('America/Los_Angeles').dt.tz_localize(None)
redeems['gaming_date'] = (redeem_local - pd.Timedelta(hours=6)).dt.date.astype(str)
loyalty_keys = ['gaming_date','home_region','opening_tier','tier_before']
earned = awards.merge(members, on='player_id', validate='many_to_one').groupby(loyalty_keys).agg(
    earned=('points_delta','sum'), coin=('coin_in_cents','sum'), theo=('theo_cents','sum'))
spent = redeems.merge(members, on='player_id', validate='many_to_one').groupby(loyalty_keys).agg(
    redemptions=('points_delta','size'), spent=('points_delta','sum'), face=('face_value_cents','sum'), cost=('economic_cost_cents','sum'))
loyalty = earned.join(spent, how='outer').fillna(0).reset_index()
assert loyalty.gaming_date.isin(set(cal.gaming_date)).all()
loyalty['day'] = loyalty.gaming_date.map({d: i for i, d in enumerate(cal.gaming_date)})
loyalty['spent'] = -loyalty.spent
for col in ['coin','theo','face','cost']:
    loyalty[col] = loyalty[col] / 100  # cents -> dollars, once
loyalty_dicts = {}
for col in ['home_region','opening_tier','tier_before']:
    loyalty[col], values = pd.factorize(loyalty[col], sort=True)
    loyalty_dicts[col] = values.tolist()
# Tier rules: lifetime points = opening lifetime points + awards to date. Per month, the lowest lifetime balance seen
# in each tier and the highest seen in the tier below it bracket the threshold; a rule change would move the bracket.
opening = pd.read_csv(guide_path('players'), usecols=['player_id','opening_lifetime_points']).set_index('player_id').opening_lifetime_points
ledger_events = pd.concat([awards[['player_id','event_at_utc','points_delta','tier_after','gaming_date']].assign(kind=0),
                    redeems[['player_id','event_at_utc','points_delta','tier_after','gaming_date']].assign(kind=1)], ignore_index=True)
ledger_events = ledger_events.sort_values(['player_id','event_at_utc','kind'], kind='stable')
ledger_events['lifetime'] = ledger_events.player_id.map(opening) + ledger_events.points_delta.where(ledger_events.kind.eq(0), 0).groupby(ledger_events.player_id).cumsum()
assert len(ledger_events) == len(ledger) and ledger_events.lifetime.notna().all()
ledger_events['month'] = ledger_events.gaming_date.str[5:7].astype(int) - 1
bands = ledger_events.groupby(['month','tier_after']).lifetime.agg(['min','max']).unstack()
tier_rules = [[int(mo), int(bands.loc[mo, ('max','Base')]), int(bands.loc[mo, ('min','Gold')]),
               int(bands.loc[mo, ('max','Gold')]), int(bands.loc[mo, ('min','Platinum')])] for mo in bands.index]
print(f'Loyalty ledger: {len(awards):,} awards and {len(redeems):,} redemptions in {len(loyalty):,} day-segment rows')

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

# Q3 response times. Each fault ticket gets response (opened -> work started) and repair (work started -> restored) minutes,
# the slot-tech roster row whose UTC window contains its opening (techs actually on duty), its manufacturer, its gaming day's
# weekday, and whether the same machine had been restored less than 14 days earlier (a repeat fault).
roster = load('shift_roster')
techs = roster[roster.role.eq('slot_tech')].copy()
assert techs.zone_id.isna().all() and not techs.duplicated(['gaming_date','shift']).any()
techs['start'] = pd.to_datetime(techs.start_utc, utc=True)
techs['end'] = pd.to_datetime(techs.end_utc, utc=True)
shift_names = ['day', 'swing', 'grave']
tickets = ops.sort_values('opened').copy()
tickets = pd.merge_asof(tickets, techs.sort_values('start')[['start','end','gaming_date','shift','planned_headcount','actual_headcount']],
                        left_on='opened', right_on='start', direction='backward')
assert (tickets.opened < tickets.end).all() and tickets.restored.notna().all() and tickets.work.notna().all()
local_open = tickets.opened.dt.tz_convert('America/Los_Angeles').dt.tz_localize(None)
assert (tickets['shift'].map(shift_names.index) == (local_open.dt.hour - 6) % 24 // 8).all()
assert (tickets.gaming_date == (local_open - pd.Timedelta(hours=6)).dt.date.astype(str)).all()
tickets['response'] = (tickets.work - tickets.opened).dt.total_seconds() / 60
tickets['repair'] = (tickets.restored - tickets.work).dt.total_seconds() / 60
tickets = tickets.merge(load('machines')[['machine_id','manufacturer']], on='machine_id', validate='many_to_one')
tickets = tickets.sort_values(['machine_id','opened'])
previous = tickets.groupby('machine_id').restored.shift()
assert not (tickets.opened < previous).any()  # no two fault tickets on one machine overlap, so ticket hours never double-count
tickets['repeat'] = ((tickets.opened - previous).dt.total_seconds() < 14 * 86400).astype(int)
tickets = tickets.sort_values('opened').reset_index(drop=True)
tickets['day'] = tickets.gaming_date.map({d: i for i, d in enumerate(cal.gaming_date)})
tickets['weekday'] = tickets.gaming_date.map(cal.set_index('gaming_date').local_weekday).map(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].index)
tickets['shift_code'] = tickets['shift'].map(shift_names.index)
tickets['bank'] = tickets.location_id.map(slot.bank_id)
tickets['cost'] = tickets.direct_cost_cents / 100  # cents -> dollars, once
ticket_makes = sorted(tickets.manufacturer.unique())
tickets['make'] = tickets.manufacturer.map(ticket_makes.index)
techs['day'] = techs.gaming_date.map({d: i for i, d in enumerate(cal.gaming_date)})
techs['shift_code'] = techs['shift'].map(shift_names.index)
loads = tickets.groupby(['day','shift_code']).size()
techs['tickets'] = [int(loads.get((d, s), 0)) for d, s in zip(techs.day, techs.shift_code)]

# Like-for-like test: the same shift and day type, one technician vs two, inside April-June (when the shortages happened),
# so season and weekday mix match. Bootstrap 95% interval (10,000 resamples) for the gap in mean response, and a one-sided
# permutation p-value. Load (tickets per shift-day) is reported because a busier day could slow response on its own.
rng = np.random.default_rng(2025)
techs['weekday'] = techs.gaming_date.map(cal.set_index('gaming_date').local_weekday).map(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].index)
def response_test(label, shift, weekdays_only, months):
    in_scope = lambda f: f['shift'].eq(shift) & f.gaming_date.str[5:7].isin(months) & (f.weekday.lt(5) if weekdays_only else True)
    group, days = tickets[in_scope(tickets)], techs[in_scope(techs)]
    one, two = (group.loc[group.actual_headcount.eq(k), 'response'].to_numpy() for k in (1, 2))
    boot = rng.choice(one, (10000, len(one))).mean(1) - rng.choice(two, (10000, len(two))).mean(1)
    pooled = np.concatenate([one, two])
    shuffled = np.take_along_axis(np.tile(pooled, (10000, 1)), rng.random((10000, len(pooled))).argsort(1), 1)
    perm = shuffled[:, :len(one)].mean(1) - shuffled[:, len(one):].mean(1)
    days1, days2 = int(days.actual_headcount.eq(1).sum()), int(days.actual_headcount.eq(2).sum())
    return {'label': label, 'n1': len(one), 'n2': len(two), 'days1': days1, 'days2': days2, 'load1': len(one) / days1, 'load2': len(two) / days2,
            'mean1': float(one.mean()), 'mean2': float(two.mean()), 'median1': float(np.median(one)), 'median2': float(np.median(two)),
            'lo': float(np.percentile(boot, 2.5)), 'hi': float(np.percentile(boot, 97.5)),
            'p': float(((perm >= one.mean() - two.mean()).sum() + 1) / 10001), 'samples': (one, two)}
spring, half = ['04','05','06'], ['01','02','03','04','05','06']
response_tests = [response_test('Day shift, Mon–Fri, Apr–Jun', 'day', True, spring), response_test('Swing shift, Apr–Jun', 'swing', False, spring)]
robust_tests = [response_test('Day shift, Mon–Fri, Jan–Jun', 'day', True, half), response_test('Swing shift, Jan–Jun', 'swing', False, half)]
# Pooled share of waiting a second technician removed, weighting each stratum by its one-technician tickets.
def pooled_share(pairs):
    weights = [len(one) for one, _ in pairs]
    return 1 - sum(w * two.mean() for w, (_, two) in zip(weights, pairs)) / sum(w * one.mean() for w, (one, _) in zip(weights, pairs))
pairs = [t['samples'] for t in response_tests]
share_draws = [pooled_share([(rng.choice(one, len(one)), rng.choice(two, len(two))) for one, two in pairs]) for _ in range(4000)]
response_share = {'share': float(pooled_share(pairs)), 'lo': float(np.percentile(share_draws, 2.5)), 'hi': float(np.percentile(share_draws, 97.5))}
for t in response_tests + robust_tests:
    del t['samples']
print('Response tests:', [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in t.items()} for t in response_tests + robust_tests], response_share)

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

# Q2 zone traffic (guide §5): aggregate sensor-hours to zone x gaming day. A null count means the counter was offline,
# never zero entries, so offline hours add no entries and no covered minutes; partial hours add the minutes they covered.
# Counts are entries (door/zone crossings), not unique visitors, and seated players are never counted.
zone_ids = sorted(load('floor_locations').query('node_type == "zone"').zone_id)
traffic = load('zone_traffic_hourly')
assert traffic.entries_count.isna().eq(traffic.counter_status.eq('offline')).all()
assert traffic.coverage_minutes.where(traffic.counter_status.eq('offline'), 0).eq(0).all()
traffic['gaming_date'] = (pd.to_datetime(traffic.hour_start_local) - pd.Timedelta(hours=6)).dt.date.astype(str)
zone_days = traffic.groupby(['zone_id','gaming_date']).agg(entries=('entries_count','sum'), minutes=('coverage_minutes','sum'),
                                                          offline=('counter_status', lambda s: int(s.eq('offline').sum()))).reset_index()
assert len(zone_days) == len(zone_ids) * len(dates)
# Reconciles with the property totals (entrance zones and all zones) in property_day.
assert np.allclose(zone_days.groupby('gaming_date').entries.sum().reindex(dates), props.total_zone_entries_observed)
zone_days['day'] = zone_days.gaming_date.map({d: i for i, d in enumerate(dates)})
zone_days['zone'] = zone_days.zone_id.map({z: i for i, z in enumerate(zone_ids)})
day_minutes = (cal.set_index('gaming_date').scheduled_seconds.reindex(dates) / 60).astype(int).tolist()
print(f'Zone traffic: {int(traffic.counter_status.eq("offline").sum())} offline and {int(traffic.counter_status.eq("partial").sum())} partial sensor-hours; '
      f'coverage {zone_days.minutes.sum() / (sum(day_minutes) * len(zone_ids)):.4f}')

# Q2 weekday x hour heat map from machine_hour: coin-in per zone x month x gaming-day weekday x local clock hour, ordered
# 06:00..05:00 so each row is one gaming day. Off-floor and unreported days are dropped by joining to the placed daily rows.
hour_rows = pd.read_csv(guide_path('machine_hour'), usecols=['machine_id','gaming_date','local_hour','coin_in_cents','available_seconds'])
hour_rows = hour_rows.merge(daily[['machine_id','gaming_date','zone_id','bank_id','configured_rtp']], on=['machine_id','gaming_date'], validate='many_to_one')
assert np.isclose(hour_rows.coin_in_cents.sum() / 100, daily.coin_in_usd.sum())
weekday_order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
hour_rows['cell'] = hour_rows.gaming_date.map(cal.set_index('gaming_date').local_weekday).map(weekday_order.index) * 24 + (hour_rows.local_hour - 6) % 24
hour_rows['month'] = hour_rows.gaming_date.str[5:7].astype(int) - 1
heat_sum = hour_rows.groupby(['zone_id','month','cell']).coin_in_cents.sum() / 100
# Occurrences: how many gaming days in the month contributed each clock hour (the DST spring-forward day lacks 02:00).
occurrences = hour_rows.drop_duplicates(['gaming_date','local_hour']).groupby(['month','cell']).size()
heat = {'zones': zone_ids, 'weekdays': weekday_order,
        'coin': [[[int(round(heat_sum.get((z, mo, c), 0))) for c in range(168)] for mo in range(6)] for z in zone_ids],
        'n': [[int(occurrences.get((mo, c), 0)) for c in range(168)] for mo in range(6)]}

# Q3 "when": down machine-hours per bank x month x weekday x clock hour. Every machine_hour row is one clock hour, so its
# scheduled time is 3,600 s (the spring-forward day simply has 23 rows); down = 3,600 - available_seconds. The hourly total
# must equal the daily scheduled-minus-available hours. Shipped sparse (non-zero cells only) in tenths of an hour.
hour_rows['down'] = (3600 - hour_rows.available_seconds) / 3600
assert (hour_rows.available_seconds.between(0, 3600)).all() and np.isclose(hour_rows.down.sum(), daily.down.sum())
down_banks = sorted(hour_rows.bank_id.unique())
down_cells = hour_rows[hour_rows.down > 0].groupby(['bank_id','month','cell']).down.sum().reset_index()
down_cells['bank'] = down_cells.bank_id.map(down_banks.index)
down_cells['tenths'] = (down_cells.down * 10).round().astype(int)
down_cells = down_cells[down_cells.tenths > 0]
# Expected win and wagers per available machine-hour in each Vegas shift (06-14 day, 14-22 swing, 22-06 grave), whole floor,
# January-June: the price of an hour of downtime in that shift. Hold is each machine-day's configured hold.
hour_rows['shift'] = (hour_rows.local_hour - 6) % 24 // 8
hour_rows['theo'] = hour_rows.coin_in_cents / 100 * (1 - hour_rows.configured_rtp)
by_shift = hour_rows.groupby('shift').agg(theo=('theo','sum'), coin=('coin_in_cents','sum'), available=('available_seconds','sum'))
shift_rates = {'theo': (by_shift.theo / (by_shift.available / 3600)).tolist(), 'coin': (by_shift.coin / 100 / (by_shift.available / 3600)).tolist()}
assert np.isclose(hour_rows.theo.sum(), daily.theo_usd.sum(), rtol=1e-6)
print('Downtime heat cells:', len(down_cells), 'shift rates', shift_rates)
del hour_rows

# Ticket overlap: fault tickets never overlap on one machine (asserted above), so fault hours inside the period add up without
# double counting. Other operations (moves, installs, maintenance) explain the rest of the meter downtime. Floor-wide, tickets
# do overlap in time, which is what loads the technicians: count the most fault tickets open at once.
period_start, period_end = limits.iloc[0], end
def clipped_hours(frame):
    start = frame.opened.clip(lower=period_start); stop = frame.restored.clip(upper=period_end)
    return float(((stop - start).dt.total_seconds().clip(lower=0) / 3600).sum())
others = operations[~operations.event_type.eq('fault_repair')].copy()
others['opened'] = pd.to_datetime(others.opened_at_utc, utc=True); others['restored'] = pd.to_datetime(others.available_at_utc, utc=True)
edges = pd.concat([pd.Series(1, index=tickets.opened), pd.Series(-1, index=tickets.restored)]).sort_index(kind='stable')
edges = edges.groupby(level=0).sum().cumsum()
ticket_overlap = {'faultHours': clipped_hours(tickets), 'otherHours': clipped_hours(others), 'meterHours': float(daily.down.sum()),
                  'tickets': len(tickets), 'sameMachineOverlaps': 0, 'maxOpen': int(edges.max()),
                  'maintenance': int(operations.event_type.eq('scheduled_maintenance').sum())}
print('Ticket overlap:', ticket_overlap)

# Q2 real-world context (guide: real_sources are later publications, so context only, never forecast inputs).
# Weather: NOAA calendar day matched to the gaming day that starts at 06:00 on that date (18 of its 24 hours overlap).
# Competing-explanation test on event-free days: wagers ~ weekday effects (+ month effects) + daily high + rain day,
# with Newey-West (7-day lag) 95% intervals because neighbouring days share shocks. Rain day = at least 1 mm.
weather = load('weather_daily')
assert weather.source_date.tolist() == dates and weather.tmax_c.notna().all() and weather.prcp_mm.notna().all()
wx = props[['gaming_date','local_weekday','coin_in_usd','events_active']].merge(
    weather[['source_date','tmax_c','prcp_mm']], left_on='gaming_date', right_on='source_date', validate='one_to_one')
wx = wx[wx.events_active.isna()].reset_index(drop=True)
wx['rain'] = (wx.prcp_mm >= 1).astype(float)
wx['month'] = wx.gaming_date.str[5:7]
def weather_fit(effects):
    design = pd.concat([pd.get_dummies(wx[f], prefix=f, drop_first=i > 0).astype(float) for i, f in enumerate(effects)]
                       + [wx[['tmax_c','rain']]], axis=1).to_numpy()
    y = wx.coin_in_usd.to_numpy()
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    resid = y - design @ beta
    count, k = design.shape
    bread = np.linalg.inv(design.T @ design)
    scores = design * resid[:, None]
    meat = scores.T @ scores
    for lag in range(1, 8):
        cross = scores[lag:].T @ scores[:-lag]
        meat += (1 - lag / 8) * (cross + cross.T)
    se = np.sqrt(np.diag(bread @ meat @ bread * count / (count - k)))[-2:]
    return {'days': int(count), 'heat': [float(beta[-2]), float(beta[-2] - 1.96 * se[0]), float(beta[-2] + 1.96 * se[0])],
            'rain': [float(beta[-1]), float(beta[-1] - 1.96 * se[1]), float(beta[-1] + 1.96 * se[1])]}
# Placebo for the few rain days: mean weekday-adjusted residual of every same-size set of event-free days (10,000 draws).
wx['residual'] = wx.coin_in_usd - wx.groupby('local_weekday').coin_in_usd.transform('mean')
rain_days = int(wx.rain.sum())
rain_gap = float(wx.residual[wx.rain.eq(1)].mean())
draws = np.random.default_rng(2025).random((10000, len(wx))).argsort(axis=1)[:, :rain_days]
placebo_share = float((wx.residual.to_numpy()[draws].mean(axis=1) <= rain_gap).mean())
weather_context = {
    'source': 'NOAA NCEI GHCN-Daily, station USW00023169 (Harry Reid International Airport)', 'url': weather.source_url.iloc[0],
    'days': [[float(r.tmax_c), float(r.prcp_mm)] for r in weather.itertuples()],
    'weekday': weather_fit(['local_weekday']), 'month': weather_fit(['local_weekday','month']),
    'rainDays': rain_days, 'rainDates': wx.gaming_date[wx.rain.eq(1)].tolist(), 'rainGap': rain_gap, 'placebo': placebo_share,
}
print('Weather test:', {k: v for k, v in weather_context.items() if k not in ('days','url')})

# Missouri Gaming Commission published slot totals (state and per property), monthly. A market comparison only.
mo_state = load('benchmark_state_monthly')
mo_property = load('benchmark_property_monthly')
assert np.allclose(mo_property.groupby('month').handle_usd.sum().to_numpy(), mo_state.handle_usd.to_numpy())
# Report names vary by month ("ARGOSY RIVERSIDE" / "ARGOSY - RIVERSIDE"), so key properties by the stable property_id.
mo_names = sorted(mo_property.property_id.unique())
assert len(mo_property) == len(mo_names) * mo_state.month.nunique()
missouri = {
    'source': 'Missouri Gaming Commission monthly financial reports (13 casinos)', 'publisher': 'https://www.mgc.dps.mo.gov/',
    'state': [[r.month, int(r.slot_units), float(r.handle_usd), r.source_url] for r in mo_state.itertuples()],
    'names': mo_names,
    'properties': [[mo_names.index(r.property_id), int(r.month[5:7]) - 1, float(r.handle_usd), int(r.slot_units)] for r in mo_property.itertuples()],
}

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

# Hit-frequency check (P10, analysis/hidden_patterns.py C1): spins that paid anything, against the published
# hit_probability of the configuration, summed per machine x month x bank so period and bank filters apply in the app.
hit_rows = daily.groupby(['machine_id','month_index','bank_id','config_id'], as_index=False)[['paid_spins','payout_positive_spins']].sum()
hit_machine = hit_rows.groupby(['machine_id','config_id'])[['paid_spins','payout_positive_spins']].sum().reset_index()
hit_p = hit_machine.config_id.map(dict(enumerate(dictionaries['config_id']))).map(published.hit_probability)
hit_machine['z'] = (hit_machine.payout_positive_spins - hit_machine.paid_spins * hit_p) / np.sqrt(hit_machine.paid_spins * hit_p * (1 - hit_p))
hit_flagged = hit_machine.loc[hit_machine.z.abs().gt(6), 'machine_id'].tolist()  # far past any multiple-test threshold; the app recomputes BH
hit_week = daily[daily.machine_id.isin(hit_flagged)].assign(week=lambda f: (f.day + 2) // 7).groupby(['machine_id','week'], as_index=False)[['paid_spins','payout_positive_spins']].sum()
# Alternative test: carded play (sessions) against uncarded play (meters minus carded) on the same flagged cabinets.
carded_hits = pd.read_csv(guide_path('sessions'), usecols=['machine_id','paid_spins','payout_positive_spins','fixed_bet_cents'])
carded_hits = carded_hits[carded_hits.machine_id.isin([dictionaries['machine_id'][i] for i in hit_flagged])]
hit_daily_spins = daily[daily.machine_id.isin(hit_flagged)].groupby('machine_id').paid_spins.median()
hit_check = {
    'hitProbability': [float(published.hit_probability[c]) for c in dictionaries['config_id']],
    # machine, month, bank, config (dictionary codes), all-play spins, spins that paid more than zero
    'rows': rows(hit_rows, ['machine_id','month_index','bank_id','config_id','paid_spins','payout_positive_spins'], 0),
    'weeks': rows(hit_week, ['machine_id','week','paid_spins','payout_positive_spins'], 0),
    'split': [[int(m), int(g.paid_spins.sum()), int(g.payout_positive_spins.sum()),
               *[int(v) for v in hit_machine.loc[hit_machine.machine_id.eq(m), ['paid_spins','payout_positive_spins']].iloc[0]],
               [[int(b), int(x.paid_spins.sum()), int(x.payout_positive_spins.sum())] for b, x in g.groupby('fixed_bet_cents')],
               float(hit_daily_spins[m])]
              for m, g in carded_hits.assign(machine_id=carded_hits.machine_id.map({v: i for i, v in enumerate(dictionaries['machine_id'])})).groupby('machine_id')],
}
print('Hit-frequency check: flagged', [dictionaries['machine_id'][i] for i in hit_flagged], 'max |z| elsewhere',
      round(float(hit_machine.loc[~hit_machine.machine_id.isin(hit_flagged), 'z'].abs().max()), 2))

# Comp repricing and visits (P10, analysis/hidden_patterns.py C2): difference in differences on recorded visits.
# Cohort = card holders with a visit in the 28 days before the before-window; comp users = redeemed before it.
# Outcome = visits in the 28 days from the split over the 28 days before, comp users minus other cohort members.
visits = pd.read_csv(guide_path('trips'), usecols=['player_id','first_observed_local'], parse_dates=['first_observed_local'])
visits['gd'] = (visits.first_observed_local - pd.Timedelta(hours=6)).dt.normalize()
redeem_days = pd.to_datetime(redeems.gaming_date)
did_rng = np.random.default_rng(2025)
def visit_did(split, reps=2000):
    split = pd.Timestamp(split)
    c0, a0, b1 = split - pd.Timedelta(days=56), split - pd.Timedelta(days=28), split + pd.Timedelta(days=28)
    cohort = visits.loc[visits.gd.ge(c0) & visits.gd.lt(a0), 'player_id'].unique()
    users = set(redeems.loc[redeem_days.lt(a0).to_numpy(), 'player_id'])
    x = visits[visits.player_id.isin(cohort)]
    frame = pd.DataFrame(index=cohort)
    frame['a'] = x[x.gd.ge(a0) & x.gd.lt(split)].groupby('player_id').size()
    frame['b'] = x[x.gd.ge(split) & x.gd.lt(b1)].groupby('player_id').size()
    frame = frame.fillna(0)
    a, b, u = frame.a.to_numpy(), frame.b.to_numpy(), frame.index.isin(users)
    def est(i):
        return b[i][u[i]].sum() / a[i][u[i]].sum() - b[i][~u[i]].sum() / a[i][~u[i]].sum()
    boot = np.array([est(did_rng.integers(0, len(a), len(a))) for _ in range(reps)])
    return {'split': str(split.date()), 'cohort': int(len(a)), 'users': int(u.sum()),
            'usersChange': float(b[u].sum() / a[u].sum() - 1), 'othersChange': float(b[~u].sum() / a[~u].sum() - 1),
            'did': float(est(np.arange(len(a)))), 'interval': [float(v) for v in np.percentile(boot, [2.5, 97.5])],
            'perMember': [float(a[u].sum() / u.sum()), float(b[u].sum() / u.sum()), float(a[~u].sum() / (~u).sum()), float(b[~u].sum() / (~u).sum())]}
# The split is the repricing date itself, found from the ledger: the day that maximises the gap between the 28-day
# points-per-face-dollar price before and after (the app's break test lands on the same day). Placebos sit 4 and 8
# weeks earlier and 4 weeks later, where no program change was found.
price_day = redeems.groupby('gaming_date').agg(spent=('points_delta','sum'), face=('face_value_cents','sum'))
price_day.index = pd.to_datetime(price_day.index)
spent_roll, face_roll = price_day.spent.rolling('28D').sum(), price_day.face.rolling('28D').sum()
price_gap = {d: abs(spent_roll.loc[:d - pd.Timedelta(days=1)].iloc[-1] / face_roll.loc[:d - pd.Timedelta(days=1)].iloc[-1]
                    - spent_roll.loc[:d + pd.Timedelta(days=27)].iloc[-1] / face_roll.loc[:d + pd.Timedelta(days=27)].iloc[-1])
             for d in price_day.index if price_day.index[0] + pd.Timedelta(days=28) <= d <= price_day.index[-1] - pd.Timedelta(days=28)}
reprice = max(price_gap, key=price_gap.get)
comp_visits = {'real': visit_did(reprice),
               'placebos': [visit_did(reprice + pd.Timedelta(days=k)) for k in (-56, -28, 28)]}
print('Comp repricing visit test:', {k: (round(v, 4) if isinstance(v, float) else v) for k, v in comp_visits['real'].items()})
data = {
    'revision': subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),
    'dates': dates, 'moves': moves, 'dicts': dictionaries, 'daily': rows(daily, columns),
    'validation': validation, 'promotions': promotions, 'inspectionWindow': inspection_window, 'julyFlags': july_flags,
    'property': rows(props, ['gaming_date','local_weekday','events_active','coin_in_usd','house_win_usd','theo_usd','entrance_zone_entries_observed','counter_coverage_share','comp_face_value_usd','comp_cost_usd','weekday_pred','base_pred','last_week_pred','expanding_weekday_pred','calendar_pred','holiday_known','event_known']),
    'players': rows(players, ['person','month','home_region','opening_tier','tracked_coin_in_usd','tracked_payout_usd','tracked_net_usd','comp_face_value_usd','comp_cost_usd','theo_usd'], 2),
    'locations': rows(locations[locations.node_type.isin(['bank','zone'])], ['location_id','node_type','zone_id','name','x_m','y_m']),
    'vacancies': rows(locations[locations.node_type.eq('slot') & ~locations.location_id.isin(daily.loc[daily.day.eq(len(dates)-1),'location_id'].map(dict(enumerate(dictionaries['location_id']))))], ['location_id','bank_id','zone_id']),
    'shifts': rows(shift_parts, ['day','bank','shift','hours','wait']),
    'downtime': {
        'makes': ticket_makes, 'banks': down_banks,
        # day, bank, shift (0 day, 1 swing, 2 grave), techs on duty, make, response min, repair min, repair cost $, weekday, repeat
        'tickets': rows(tickets, ['day','bank','shift_code','actual_headcount','make','response','repair','cost','weekday','repeat'], 1),
        # day, shift, planned and actual slot techs, fault tickets opened in that shift
        'roster': rows(techs.sort_values(['day','shift_code']), ['day','shift_code','planned_headcount','actual_headcount','tickets'], 0),
        'heat': rows(down_cells, ['bank','month','cell','tenths'], 0),
        'rates': shift_rates, 'tests': response_tests, 'robust': robust_tests, 'share': response_share, 'overlap': ticket_overlap,
    },
    'city': rows(city, ['month','mean_visitors_per_calendar_day','source_url']),
    'events': rows(events, ['name','start_date','end_date','local_scope']),
    'payoutConfig': payout_config,
    'playerAge': player_age, 'concentration': concentration_ref,
    'carded': rows(carded_monthly, ['month','coin_in_cents','payout_cents','theo_cents','carded_coin_in_cents','carded_payout_cents',
                                    'carded_theo_cents','machine_months','machine_months_above'], 2),
    'loyalty': {'dicts': loyalty_dicts, 'rows': rows(loyalty, ['day','home_region','opening_tier','tier_before','earned','coin','theo',
                                                              'redemptions','spent','face','cost'], 2),
                'tierRules': tier_rules},
    'configs': rows(configs, ['config_id','configured_rtp','volatility','payout_multiplier_variance']),
    'luck': rows(luck, ['machine_id','month_index','bank_id','luck_var'], 1),
    'hitCheck': hit_check, 'compVisits': comp_visits,
    'zoneTraffic': {'zones': zone_ids, 'dayMinutes': day_minutes, 'rows': rows(zone_days, ['zone','day','entries','minutes','offline'], 0)},
    'heat': heat, 'weather': weather_context, 'missouri': missouri,
    'actions': rows(actions, ['action_type_id','name','unit_cost_cents','recurring_cost_cents_per_day','lead_days','downtime_minutes','quantity_limit']),
}
payload = json.dumps(data, separators=(',',':'), ensure_ascii=False, allow_nan=False).replace('</','<\\/')
# The React app (npm run build) inlines this file into dist/index.html; `npm run dev` serves it as /data.json.
(project/'data').mkdir(exist_ok=True)
(project/'data'/'dashboard.json').write_text(payload)
