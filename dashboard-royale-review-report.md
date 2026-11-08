# Dashboard Royale revision report

## Decision

Fund the **$1,200 payout inspection for M-1158** and leave **$98,800** unspent. Defer the proposed $1,800 move of M-1181. The move remains a candidate if more comparable evidence supports a floor-wide gain after displacement and disruption.

## 1. Benchmark the forecast against last week

The forecast page now compares the frozen January–April weekday averages with the actual total from seven days earlier, day by day on the same 61-day May–June holdout. The constant training mean remains in the table for context. The seven-day benchmark uses information already available on each forecast date, so it is a rolling day-ahead comparison.

| May–June metric | Frozen weekday averages | Same weekday last week |
|---|---:|---:|
| Mean absolute error | $68,699 | $82,070 |
| Actual peak days correctly flagged | 18/19 | 18/19 |
| Actual regular days correctly classified | 14/14 | 10/14 |
| Actual quiet days correctly flagged | 25/28 | 25/28 |
| False peak flags | 0 | 1 |
| False regular flags | 4 | 4 |
| False quiet flags | 0 | 3 |

The forecast's advantage is **16.3% lower MAE** against the stronger baseline. A separate expanding-window check using only past days at each origin yields **$61,608** against **$85,997** over 122 days from March through June. That check overlaps the main holdout in May and June and uses a different training protocol. Six months still leave seasonal generalization open.

**Why it helps.** The comparison tests whether the model adds value beyond repeating last week's weekday pattern. Including regular days exposes where borderline decisions go.

## 2. Show the whole demand trend and remove event distortion

The demand chart shows all six observed monthly averages alongside an event-free series that gives each weekday equal weight. The dashboard also isolates the Super Bowl weekend sensitivity. February falls from **$1.413 million per day** to **$1.350 million** when only those three days are removed. In the fully adjusted series, demand peaks in **April at $1.386 million per day** and ends June at **$1.305 million**, **2.9% below January**.

**Why it helps.** February's raw peak is sensitive to the event, while weaker demand late in the period survives both adjustments. The chart supports a spring peak followed by a decline. This adjustment covers recorded events and weekday mix. It does not identify why the trend changed.

## 3. Use historical moves to test the relocation assumptions

For each historical move, the dashboard now shows the pre-move rate gap to same-configuration destination-zone controls, the matched cabinet gain, and the change in expected win across both affected banks. It repeats the capture comparison with seven- and fourteen-day windows. Of four moves, only two had positive pre-move gaps at 14 days. Their estimated captures were **+109.5%** and **−69.8%**. Only two cabinets had a positive matched gain in expected win per day, the denominator required for the bank-pair offset proxy. Those offsets were about **−2.2%** and **119.3%**. These noisy proxies reflect differences in comparison groups and potential redistribution beyond the two banks.

**Why it helps.** Historical results now inform the decision without treating unstable ratios as reliable forecasts for a different route. At 50% capture, the proposed move still changes from **+$196** to **−$6** at 10% displacement. With no route-and-configuration match and little room for error, the budget funds the inspection only.

## 4. Compare downtime with the trend at the same scale

The dashboard displays the **$5,572 per day** average in wagers at risk over the full period. From February to June, raw daily wagers fell by **about $89,126**, while estimated daily downtime risk **fell by about $1,278**. The event-free, weekday-adjusted comparison also shows lower risk in June than in January. Adding all modeled risk back to every month's wagers leaves the adjusted decline in place.

**Why it helps.** The relevant quantity for explaining a trend is how downtime risk *changed*. The observed change goes in the opposite direction. The estimate still helps prioritize uptime work and is a gross exposure scenario before guest substitution and within-day demand differences.

## 5. Use only past dates for sparse zone matches

Dense zones still use same-day, same-configuration peer matching. Sparse zones now use the **prior 28 gaming days** to estimate the zone adjustment, excluding the focal cabinet. Rows with insufficient history carry no local comparison and are excluded from the local and zone ratios. The dashboard shows coverage and requires at least half of available hours to be covered before applying either demand flag. The revision leaves **nine quiet-placement flags** among the bottom ten, and no cabinet crosses the low-local-demand threshold.

**Why it helps.** Earlier estimates no longer borrow from later outcomes. Showing gaps in coverage avoids treating missing local evidence as ordinary demand. Same-day peer comparisons remain descriptive and do not identify a causal placement effect.

## Submission note

The dashboard, write-up, claims table and updated walkthrough all reflect the $98,800 reserve, deferred relocation and 16.3% forecast improvement. The July tab also models the inspection’s conditional recovery and compares three unfunded alternatives.

## Final review refinements

Adjusted April–June property wagers fell 5.8% versus 7.2% fewer daily visitors citywide. January–June adjusted downtime risk fell $1,027/day while adjusted wagers fell $38,521/day. The calendar-adjusted holdout MAE is $66,566, and the frozen weekday model beat the seven-day lag on 34 of 61 days. The paired seven-day block-bootstrap interval for its MAE savings crosses zero.

The July plan schedules M-1158 on July 2, 8–10 a.m. Las Vegas time, estimated to save $17 in theoretical win versus an average Wednesday window. M-1181 remains deferred. Waiting trades the chance of a small positive July net result and earlier learning against a result that can flip negative with modest displacement.
