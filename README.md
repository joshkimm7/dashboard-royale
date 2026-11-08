# Dashboard Royale — The Gilded Ace

Build the dashboard using the instructions under [Reproduce](#reproduce), then open `dist/index.html` in a modern desktop browser with JavaScript enabled. The generated file embeds the data and runs offline. Use the opening shortcuts to see the payout stress test and historical moves. The July decision tab shows the budget. The month selectors apply to the descriptive views. Forecast validation and July decision use fixed evidence windows.

## Devpost write-up

Cancel the blanket replacement. Nine of the ten lowest earners were in quiet placements, one had a persistent payout shortfall, and none fell below 80% of matched local coin-in per available hour. M-1158 held 3.04% versus 10.00% configured, a $36,165 shortfall. The gap remained 6.86 percentage points after removing its worst week. The adjusted q below 0.001 supports inspection under the payout model. It does not estimate repairability.

After removing listed events and equalizing weekday mix, April to June wagers fell 5.8%, while Las Vegas visitors per day fell 7.2%. That is consistent with broader market softness. From January to June, adjusted downtime risk fell $1,027/day while adjusted wagers fell $38,521/day, so downtime cannot explain the decline in this model. Among 96,559 active carded players, the top 1% by wagers accounted for 20.4% of tracked coin-in. Property comps cost $190,669, rising from 0.73% to 0.88% of expected slot win.

On the 61-day May–June holdout, the frozen weekday model scored $68,699 MAE against $82,070 for the seven-day lag. It won on 34 days. The paired block-bootstrap interval for MAE savings was −$9,835 to +$37,884. Adding pre-announced event and holiday flags brought holdout MAE to $66,566.

Fund the $1,200 inspection and reserve $98,800. Schedule M-1158 for July 2, 8–10 a.m. Las Vegas time, saving an estimated $17 in expected win versus an average Wednesday window. Full correction after the one-day lead implies $5,794 in July recovery and a 20.7% break-even probability before other costs. Compare four weeks before and after against same-configuration peers. Defer the $1,800 relocation. Only two of four moved cabinets improved their matched hourly rate. At 50% capture, waiting forgoes about $196 in the no-displacement scenario and delays learning, while 10% displacement turns that scenario into a $6 loss.

See [the revision report](dashboard-royale-review-report.md) for methods and limits. The [updated walkthrough](gilded-ace-walkthrough.mp4) covers the July budget, adjusted demand and stronger forecast baseline.

## Reproduce

Use the official dataset at commit `5f9274bdc3efa6614e6c081becaeadda34c57a32`. The data is synthetic, except for the separately attributed Las Vegas context. The HTML runs without these build steps.

```bash
git clone https://github.com/tamu-datathon-org/dashboard-royale.git official-data
git -C official-data checkout 5f9274bdc3efa6614e6c081becaeadda34c57a32
python -m pip install 'pandas==2.2.3' 'numpy>=1.26,<3'
mkdir -p dist
python build_data.py official-data
```

Open `dist/index.html`. The Python script performs the data joins, holdout setup, and data preparation. The source template contains the scope filters, machine screening, charts, and recommendations.
