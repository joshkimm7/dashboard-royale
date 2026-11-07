# Dashboard Royale — The Gilded Ace

Build the dashboard using the instructions under [Reproduce](#reproduce), then open `dist/index.html` in a modern desktop browser with JavaScript enabled. The generated file embeds the data and runs offline. Use the opening shortcuts to see the payout stress test and historical moves. The July decision tab shows the budget. The month selectors apply to the descriptive views. Forecast validation and July decision use fixed evidence windows.

## Devpost write-up

The Gilded Ace should stop its plan to replace the ten lowest earners. Nine of those cabinets were in Back Forty, where comparable games drew about 63–70% of the floor rate, and two had fewer than 60 days of exposure. None of the bottom ten drew under 80% of matched local coin-in per available hour. M-1158 was the exception on payout performance. Its observed hold was 3.04% versus 10.00% configured, a $36,165 shortfall on actual wagers that persisted across both halves of the period. Removing its worst week left a 6.86 percentage-point shortfall.

The raw February peak is sensitive to Super Bowl weekend. Removing recorded event days and equalizing weekday mix moves the peak to April. Adjusted June wagers were 2.9% below January. Estimated downtime exposure averaged $5,572/day and fell from February to June while raw daily wagers dropped $89,126. Tracked players wagered $163.80 million and finished down $15.59 million. The top 1% by wagers accounted for 22.9% of tracked coin-in. Property comps cost $190,669, and cost as a share of expected slot win rose from 0.73% to 0.88%.

On the same 61 May–June holdout days, frozen weekday averages scored $68,699 MAE versus $82,070 for the rolling same-weekday-last-week baseline, a 16.3% improvement. The weekday model correctly flagged 18 of 19 peak days, 25 of 28 quiet days, and all 14 regular days. A separate March–June expanding-window check supports the comparison.

Fund the $1,200 payout inspection and reserve $98,800. Defer the $1,800 relocation. Only two historical moves had positive pre-move rate gaps at 14 days, and their matched capture estimates diverged. At 50% capture, the proposed move shifts from a $196 gain to a $6 loss at 10% displacement. A future pilot should measure incremental expected win across affected banks and account for offsetting losses elsewhere.

See [the revision report](dashboard-royale-review-report.md) for methods and limits. The existing walkthrough predates the revised July budget.

## Reproduce

Use the official dataset at commit `5f9274bdc3efa6614e6c081becaeadda34c57a32`. The data is synthetic, except for the separately attributed Las Vegas context. After building, the HTML opens directly in a browser.

```bash
git clone https://github.com/tamu-datathon-org/dashboard-royale.git official-data
git -C official-data checkout 5f9274bdc3efa6614e6c081becaeadda34c57a32
python -m pip install 'pandas==2.2.3' 'numpy>=1.26,<3'
mkdir -p dist
python build_data.py official-data
```

Open `dist/index.html`. The Python script performs the data joins, holdout setup, and data preparation. The source template contains the scope filters, machine screening, charts, and recommendations.
