# The Gilded Ace · Dashboard Royale

Built for the **Dashboard Royale challenge at TAMU Datathon 2026**. The Gilded Ace is a fictional Las Vegas casino with 300 slot machines. Management wants to replace the ten lowest earners. This interactive dashboard asks whether low earnings are better explained by limited time on the floor, quiet locations, downtime, or unusual payouts.

**[Open the dashboard](https://gilded-ace-two.vercel.app/)** · [Challenge guide and dataset](https://github.com/tamu-datathon-org/dashboard-royale/blob/5f9274bdc3efa6614e6c081becaeadda34c57a32/GUIDE.md)

## What the dashboard found

- **Cancel the blanket replacement.** Nine of the ten lowest earners were in quiet zones. M-1158 was the only cabinet flagged for an unusual payout gap. Its observed casino win was about **$36,165 below** what its configured payout rate implied, which warrants a meter and paytable check.
- **Measure both banks after a move.** All four destination banks gained in the historical comparisons, and only two source–destination pairs gained overall. A busier destination alone gives an incomplete picture.
- **Fund one inspection.** The July plan allocates **$1,200** to inspect M-1158 and holds **$98,800** in reserve. It defers a relocation and sets a break-even requirement for a promotion pilot.

## Explore the dashboard

| View | What you can do |
| --- | --- |
| **Machine audit** | Expand the bottom-ten verdicts, filter by bank or month, and inspect the evidence behind each recommendation. |
| **Demand & uptime** | Compare wagering trends with event timing, traffic, and estimated downtime exposure. |
| **Guests & comps** | Explore tracked wagering, player concentration, and loyalty costs by guest segment. |
| **Model validation** | Compare weekday averages with a seven-day lag and a constant forecast on a 61-day holdout, then see how each forecast changes simulated staffing calls. |
| **July decision** | Review the budget, compare historical relocations, and test repair quotes under different recovery assumptions. |

The analysis uses synthetic casino data from January–June 2025, with separately attributed real-world Las Vegas context. See [Claims and Evidence](CLAIMS-AND-EVIDENCE.md) for sources, calculations, limitations, and AI-use disclosure.

## Reproduce locally

Run these commands from the repository root with **Python 3.11 or later** and **Git**. The build pins the official challenge data to the revision used in the analysis.

```bash
git clone https://github.com/tamu-datathon-org/dashboard-royale.git official-data
git -C official-data checkout 5f9274bdc3efa6614e6c081becaeadda34c57a32
python -m pip install 'pandas==2.2.3' 'numpy==2.3.5'
mkdir -p dist
python build_data.py official-data
```

Open `dist/index.html` in a browser. The generated page embeds its data and works offline. [`build_data.py`](build_data.py) prepares the data and forecast holdout, and [`dashboard.html`](dashboard.html) contains the interface and browser-side analysis.
