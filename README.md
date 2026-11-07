# Dashboard Royale — The Gilded Ace

Build the dashboard using the instructions under [Reproduce](#reproduce), then open `dist/index.html` in a modern desktop browser with JavaScript enabled. The generated file embeds the data and runs offline. Use the opening shortcuts to see the payout stress test and historical moves. The July decision tab shows the budget. The month selectors apply to the descriptive views. Forecast validation and July decision use fixed evidence windows.

## Devpost write-up

The Gilded Ace should stop its plan to replace the ten lowest earners. Nine of those cabinets were in Back Forty, where comparable games drew about 63–70% of the floor rate, and two had fewer than 60 days of exposure. None of the bottom ten drew under 80% of matched local coin-in per available hour. M-1158 was the exception on payout performance. Its observed hold was 3.04% versus 10.00% configured, a $36,165 shortfall on actual wagers that persisted across both halves of the period. Removing its worst week left a 6.86 percentage-point shortfall.

From February to June, daily wagers fell 6.3%. Less time spent playing accounts for $65,260 per day of the decline, while lower wagers per occupied hour account for $23,866. Event comparisons use non-event days of the same weekday and month. Floor meters logged 5,021 unavailable hours, with about $1.01 million in estimated coin-in at risk. That is an exposure estimate before guest substitution. Tracked players wagered $163.80 million, received $148.22 million and finished down $15.59 million. The top 1% by wagers accounted for 22.9% of tracked coin-in. Property comps cost $190,669, and cost as a share of expected slot win rose from 0.73% to 0.88%.

The weekday forecast, trained on January–April and frozen for May–June, cut daily coin-in MAE from $218,258 to $68,699. It flagged 18 of 19 peak days and 25 of 28 quiet days in the holdout, with zero false flags in either tier. Use it to schedule cabinet work on quieter days.

Spend $1,200 to inspect M-1158 and $1,800 to test relocating M-1181 to a vacant Center Pit slot. In four prior moves, all receiving banks gained relative to comparison banks, but only two source-destination pairs gained in aggregate. Compare the July move with a same-configuration control and check both banks and the rest of the floor for displaced play. Reserve $97,000. The inspection buys information. At 50% placement capture, the move nets $196 with no displacement and loses $6 at 10% displacement. Expand only if the measured incremental floor gain covers the move cost.

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
