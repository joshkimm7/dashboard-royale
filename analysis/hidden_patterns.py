"""P10 hidden-pattern hunt: exploration record for the tables the dashboard did not yet use.

Run: python3 analysis/hidden_patterns.py <official-data>
Every candidate prints its estimate, an alternative explanation and a placebo. Verdicts are in analysis/FINDINGS.md.
The two results the dashboard shows are re-derived in build_data.py (hit-frequency check, comp-repricing visit test).
Security incidents are reported reports, not findings of wrongdoing; only aggregates are printed, never single guests.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

parser = argparse.ArgumentParser()
parser.add_argument('repo', type=Path)
root = parser.parse_args().repo.resolve() / 'data'


def load(name, columns=None):
    path, = root.rglob(f'{name}.parquet')
    return pd.read_parquet(path, columns=columns)


def gaming_day(local):
    """Vegas gaming day: the 06:00-06:00 book day of a local timestamp."""
    return (pd.to_datetime(local) - pd.Timedelta(hours=6)).dt.normalize()


def bh(p):
    """Benjamini-Hochberg q-values."""
    p = np.asarray(p, float)
    order = np.argsort(p)
    q = p[order] * len(p) / np.arange(1, len(p) + 1)
    q = np.minimum.accumulate(q[::-1])[::-1]
    out = np.empty_like(q)
    out[order] = np.minimum(q, 1)
    return out


def norm_sf(z):
    from math import erfc, sqrt
    return np.array([erfc(abs(v) / sqrt(2)) for v in np.atleast_1d(z)])  # two-sided


D = pd.Timestamp
rng = np.random.default_rng(10)
print('=' * 100)

# ---------------------------------------------------------------------------------------------------------------
# C1  Hit frequency vs published game math (game_math.hit_probability; machine_day and sessions spin counts)
# ---------------------------------------------------------------------------------------------------------------
print('C1  Hit frequency against published game math')
gm = load('game_math').set_index('config_id')
md = load('machine_day', ['machine_id', 'gaming_date', 'location_id', 'config_id', 'meter_status', 'paid_spins',
                          'payout_positive_spins', 'carded_spins', 'coin_in_cents', 'payout_cents'])
md = md[md.location_id.notna() & md.meter_status.eq('reported')]
hp = md.config_id.map(gm.hit_probability.astype(float))
per = md.assign(hp=hp).groupby(['machine_id', 'config_id']).agg(sp=('paid_spins', 'sum'), hit=('payout_positive_spins', 'sum'),
                                                                 hp=('hp', 'first')).reset_index()
per['obs'] = per.hit / per.sp
per['z'] = (per.hit - per.sp * per.hp) / np.sqrt(per.sp * per.hp * (1 - per.hp))
per['q'] = bh(norm_sf(per.z))
flag = per[per.q < 0.01]
print(f'  {len(per)} cabinets tested, {len(flag)} with BH q < 0.01')
print(flag[['machine_id', 'config_id', 'sp', 'obs', 'hp', 'z']].to_string(index=False))
others = per[~per.machine_id.isin(flag.machine_id)]
print(f'  Placebo (other cabinets): z mean {others.z.mean():+.2f}, SD {others.z.std():.2f}, max |z| {others.z.abs().max():.2f}')
for m in flag.machine_id:
    x = md[md.machine_id.eq(m)].copy()
    x['w'] = pd.to_datetime(x.gaming_date).dt.to_period('W')
    w = x.groupby('w')[['paid_spins', 'payout_positive_spins', 'coin_in_cents', 'payout_cents']].sum()
    rate, p0 = w.payout_positive_spins / w.paid_spins, float(gm.hit_probability[x.config_id.iloc[0]])
    rtp = w.payout_cents / w.coin_in_cents
    print(f'  {m}: weeks above published rate {int((rate > p0).sum())} of {len(w)}; weekly hit rate SD {rate.std():.4f};'
          f' weeks with RTP above configured {int((rtp > float(gm.configured_rtp[x.config_id.iloc[0]])).sum())} of {len(w)}')
    first4 = w.iloc[:4]
    print(f'    Pre-period (first 4 weeks only): {first4.payout_positive_spins.sum() / first4.paid_spins.sum():.4f} vs {p0:.4f}')
    daily = x.groupby('gaming_date').paid_spins.sum()
    print(f'    Median all-play spins per day {daily.median():.0f}; one-day SE at the published rate'
          f' {np.sqrt(p0 * (1 - p0) / daily.median()):.4f}')
# Alternative: one group of players (carded) could drive it. Split carded (sessions) vs uncarded (meters minus carded).
ses = load('sessions', ['machine_id', 'fixed_bet_cents', 'paid_spins', 'payout_positive_spins'])
for m in flag.machine_id:
    s = ses[ses.machine_id.eq(m)]
    cs, ch = s.paid_spins.sum(), s.payout_positive_spins.sum()
    t = per[per.machine_id.eq(m)].iloc[0]
    print(f'  {m}: carded {ch / cs:.4f} on {cs:,} spins; uncarded {(t.hit - ch) / (t.sp - cs):.4f} on {t.sp - cs:,} spins')
    print('    by bet size:', s.groupby('fixed_bet_cents').apply(lambda g: round(g.payout_positive_spins.sum() / g.paid_spins.sum(), 4),
                                                              include_groups=False).to_dict())
print('  Check: carded spins in meters equal session spins:',
      bool(md.groupby('machine_id').carded_spins.sum().sort_index().equals(ses.groupby('machine_id').paid_spins.sum().sort_index())))

# ---------------------------------------------------------------------------------------------------------------
# C2  Did the May 1 comp repricing bring comp users back more often? (trips, loyalty_ledger) - difference in differences
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C2  Comp repricing (May 1) and visit frequency of comp users')
trips = load('trips', ['player_id', 'first_observed_local'])
trips['gd'] = gaming_day(trips.first_observed_local)
led = load('loyalty_ledger', ['player_id', 'event_at_utc', 'event_type'])
red = led[led.event_type.eq('redeem')].copy()
red['gd'] = gaming_day(red.event_at_utc.dt.tz_localize('UTC').dt.tz_convert('America/Los_Angeles').dt.tz_localize(None))


def did(split, reps=2000):
    """Cohort = players with a visit in the 28 days before the before-window; comp users redeemed before the split.
    Outcome = visits in 28 days after the split / 28 days before it, comp users minus everyone else."""
    c0, a0, b0, b1 = split - pd.Timedelta(days=56), split - pd.Timedelta(days=28), split, split + pd.Timedelta(days=28)
    cohort = trips[(trips.gd >= c0) & (trips.gd < a0)].player_id.unique()
    users = set(red[red.gd < a0].player_id)
    x = trips[trips.player_id.isin(cohort)]
    frame = pd.DataFrame(index=cohort)
    frame['a'] = x[(x.gd >= a0) & (x.gd < b0)].groupby('player_id').size()
    frame['b'] = x[(x.gd >= b0) & (x.gd < b1)].groupby('player_id').size()
    frame = frame.fillna(0)
    a, b, u = frame.a.values, frame.b.values, frame.index.isin(users)

    def est(i):
        ua, ub = a[i][u[i]].sum(), b[i][u[i]].sum()
        na, nb = a[i][~u[i]].sum(), b[i][~u[i]].sum()
        return ub / ua - nb / na, ub / ua - 1, nb / na - 1
    point = est(np.arange(len(a)))
    boot = [est(rng.integers(0, len(a), len(a)))[0] for _ in range(reps)]
    return len(a), int(u.sum()), point, np.percentile(boot, [2.5, 97.5])


for label, split in [('real  May 1', D('2025-05-01')), ('placebo Apr 3', D('2025-04-03')), ('placebo Mar 6', D('2025-03-06')),
                     ('placebo May 29', D('2025-05-29'))]:
    if split + pd.Timedelta(days=28) > D('2025-06-30'):
        continue
    n, nu, (d, cu, co), ci = did(split)
    print(f'  {label}: cohort {n:,} ({nu:,} comp users); comp users {cu:+.1%}, others {co:+.1%}; DiD {d:+.1%} (95% {ci[0]:+.1%} to {ci[1]:+.1%})')

# ---------------------------------------------------------------------------------------------------------------
# C3  Comps cannibalising cash food and drink (fnb_transactions); comp cost counted once via the ledger, not here
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C3  Do comps displace cash food-and-drink sales? (per carded visit, 28-day windows)')
fnb = load('fnb_transactions', ['player_id', 'observed_visit_id', 'event_at_local', 'cash_receipt_cents', 'comp_id', 'cogs_cents'])
fnb['gd'] = gaming_day(fnb.event_at_local)
cuts = [D('2025-01-09') + pd.Timedelta(days=28 * k) for k in range(7)]
for a, b in zip(cuts, cuts[1:]):
    f, v = fnb[(fnb.gd >= a) & (fnb.gd < b)], trips[(trips.gd >= a) & (trips.gd < b)]
    card = f[f.player_id.notna()]
    comp = card.comp_id.notna()
    print(f'  {a.date()}: cash tickets/100 visits {100 * (~comp).sum() / len(v):5.2f}, comp tickets/100 {100 * comp.sum() / len(v):5.2f},'
          f' cash $/visit {card.cash_receipt_cents.sum() / len(v) / 100:.2f}, uncarded tickets/day {f.player_id.isna().sum() / 28:.0f}')

# ---------------------------------------------------------------------------------------------------------------
# C4  Security incidents: tampering reports as an early warning of machine faults (security_incidents, operations)
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C4  Tampering-attempt reports and later faults on the same machine (placebo: shuffled report dates)')
inc = load('security_incidents')
ops = load('operations')
faults = ops[ops.event_type.eq('fault_repair')]
tamper = inc[inc.machine_id.notna()]
print(f'  Machine-linked reports: {len(tamper)} (categories {tamper.category.unique().tolist()}) on {tamper.machine_id.nunique()} machines')
by_machine = {m: g.opened_at_utc.values for m, g in faults.groupby('machine_id')}


def faults_after(times, machines, days=7):
    hits = 0
    for t, m in zip(times, machines):
        f = by_machine.get(m, np.array([], 'datetime64[us]'))
        hits += ((f > t) & (f <= t + np.timedelta64(days, 'D'))).sum()
    return hits / len(times)


real = faults_after(tamper.occurred_at_utc.values, tamper.machine_id)
before = faults_after((tamper.occurred_at_utc - pd.Timedelta(days=7)).values, tamper.machine_id)
lo, hi = D('2025-01-01 14:00').value, D('2025-06-23').value
placebo = [faults_after(pd.to_datetime(rng.uniform(lo, hi, len(tamper))).values, tamper.machine_id) for _ in range(200)]
print(f'  Faults per report in the next 7 days {real:.3f}; in the 7 days before {before:.3f};'
      f' placebo mean {np.mean(placebo):.3f} (95% {np.percentile(placebo, 2.5):.3f}-{np.percentile(placebo, 97.5):.3f})')

# ---------------------------------------------------------------------------------------------------------------
# C5  Security workload by zone and shift against flat staffing (security_incidents, shift_roster, zone_traffic_hourly)
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C5  Incident load by zone x shift vs security officer roster')
roster = load('shift_roster')
sec = roster[roster.role.eq('security_officer')]
print('  Officer headcount per zone and shift (planned/actual, distinct values):',
      sec.groupby('shift').actual_headcount.unique().to_dict(), '; any shortfall:', bool((sec.actual_headcount < sec.planned_headcount).any()))
shift = lambda h: pd.cut((h - 6) % 24, [-1, 7, 15, 23], labels=['day', 'swing', 'grave'])
inc['s'] = shift(inc.local_hour)
traffic = load('zone_traffic_hourly')
traffic = traffic[traffic.entries_count.notna()]  # null = counter offline, never zero
traffic['s'] = shift(traffic.local_hour)
t = traffic.groupby(['zone_id', 's'], observed=True).agg(e=('entries_count', 'sum'), cm=('coverage_minutes', 'sum'))
t['inc'] = inc.groupby(['zone_id', 's'], observed=True).size()
t['per_1k_entries'] = 1000 * t.inc / (t.e * 181 * 8 * 60 / t.cm)
print(t[['inc', 'per_1k_entries']].round(2).unstack().to_string())
inc['half'] = np.where(inc.occurred_at_local < '2025-04-01', 'H1', 'H2')
halves = inc.groupby(['zone_id', 's', 'half'], observed=True).size().unstack()
print(f'  Stability: Spearman rank correlation of zone-shift counts, Jan-Mar vs Apr-Jun = {halves.corr(method="spearman").iloc[0, 1]:.3f}')

# ---------------------------------------------------------------------------------------------------------------
# C6  New-bank novelty decay (placements history, operations installs, prepared_daily_view)
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C6  Novelty decay of the eight cabinets installed together on Mar 24')
pdv = load('prepared_daily_view', ['machine_id', 'gaming_date', 'zone_id', 'config_id', 'location_id', 'meter_status', 'theo_usd', 'available_hours'])
pdv = pdv[pdv.location_id.notna() & pdv.meter_status.eq('reported')].copy()
for c in ['theo_usd', 'available_hours']:
    pdv[c] = pdv[c].astype(float)
installs = ops[ops.event_type.eq('install') & ops.opened_at_local.eq(D('2025-03-24 06:00'))].machine_id
pdv['gd'] = pd.to_datetime(pdv.gaming_date)
x = pdv[(pdv.gd >= '2025-03-24') & pdv.zone_id.eq('Z-PIT')].copy()
x['grp'] = np.where(x.machine_id.isin(installs), 'new', 'old')
x['fortnight'] = (x.gd - D('2025-03-24')).dt.days // 14
g = x.groupby(['fortnight', 'grp'])[['theo_usd', 'available_hours']].sum()
r = (g.theo_usd / g.available_hours).unstack()
print('  New bank expected win per available hour / other Pit cabinets, by fortnight since install:',
      (r.new / r.old).round(3).tolist())
pl = load('placements')
print(f'  Placements: {len(pl)} spans, {pl.machine_id.duplicated().sum()} machines moved, config changes across spans:',
      int((pl.groupby("machine_id").config_id.nunique() > 1).sum()))

# ---------------------------------------------------------------------------------------------------------------
# C7  Guest survey (visitor_profile_monthly): did guest mix shift April -> June?
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C7  Exit survey: April vs June guest mix (z = difference / combined sampling SE)')
v = load('visitor_profile_monthly').set_index(['survey_metric', 'month'])
for metric in v.index.levels[0]:
    a, b = v.loc[(metric, '2025-04')], v.loc[(metric, '2025-06')]
    print(f'  {metric:28s} Apr {a.estimate:8.3f}  Jun {b.estimate:8.3f}  z {(b.estimate - a.estimate) / np.hypot(a.standard_error, b.standard_error):+.2f}')
card_share = md.carded_spins.sum() / md.paid_spins.sum()
print(f'  Survey loyalty-card use (Jan-Jun mean {v.xs("used_loyalty_card", level=0).estimate.iloc[:6].mean():.3f}) vs carded share of spins {card_share:.3f}')

# ---------------------------------------------------------------------------------------------------------------
# C8  Session and visit rhythm (sessions, trips): month-to-month return rate and visit length
# ---------------------------------------------------------------------------------------------------------------
print('=' * 100)
print('C8  Return rate and visit length by month')
trips_full = load('trips', ['player_id', 'first_observed_local', 'first_observed_at_utc', 'last_observed_at_utc'])
trips_full['m'] = gaming_day(trips_full.first_observed_local).dt.month
trips_full['mins'] = (trips_full.last_observed_at_utc - trips_full.first_observed_at_utc).dt.total_seconds() / 60
months = trips_full.groupby('m').player_id.apply(set)
for m in range(1, 6):
    print(f'  month {m}->{m + 1}: {len(months[m] & months[m + 1]) / len(months[m]):.3f} of active players return;'
          f' median carded visit length {trips_full[trips_full.m.eq(m)].mins.median():.1f} min')
print('Done.')
