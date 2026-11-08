# The Gilded Ace: write-up

## Problem

The Gilded Ace, a fictional casino, planned to replace its ten lowest-earning slots and had $100,000 for July. We asked why those ten earn little: luck, location, downtime or a payout fault.

## Findings

**Luck.** We ranked every cabinet by expected win per available hour against same-game peers in its zone, shrinking thin records toward average. Only 1 of the raw bottom ten (M-1120) is in the adjusted bottom ten. The raw list mostly reflects exposure and luck: 4 of the other 9 earn at least their matched peers' expected win per hour.

**Location.** Nine of ten sit in quiet zones. Past moves were mixed: only 2 of 4 moved pairs gained across both banks.

**Leak.** M-1158 won $15,796 against $51,961 expected, $36,165 below its configured hold. It paid on 38.6% of spins against a published 31.5%, above it in 27 of 27 weeks. That is a lead to inspect, not proof.

## Model

We fit a forecast from weekday averages of daily coin-in on January to April, froze it, then scored May and June. Its 61-day holdout MAE was $68,699, against $82,070 for a seven-day lag and $218,258 for a constant mean. It beat the lag on 34 of 61 days, but the paired bootstrap interval (−$9,835 to +$37,884) includes zero, so the gain is modest. It sets routine July staffing; at a $1.50m cutoff it caught 18 of 19 peak days.

## Priced actions

1. **Inspect M-1158, $1,200.** If a fault is found and fixed, July recovery is $5,794, so it pays if the chance of a full fix exceeds 20.7%. We measure four weeks of payout residual before and after against same-game peers.
2. **Keep $98,800 in reserve.** The ledger reads $1,200 + $98,800 reserve = $100,000, and every catalog rule passes.
3. **Promotion weekend, unfunded.** The $15,000 comes from the reserve only if July 4 registrations show it can retain 25.3% of the weaker past lift. We would measure it against matched weekdays, including seven days after.

The M-1181 move ($1,800) is deferred. At 50% capture it nets +$196 with no displaced play and −$6 with 10%.

## Limitations

The data is synthetic and covers six months. The chance of a fixable fault is unknown. Move and promotion effects rest on four past moves and two events. Outside data (LVCVA, NOAA, Missouri) is context only, never a forecast input.
