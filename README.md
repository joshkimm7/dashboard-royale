# The Gilded Ace · Dashboard Royale

Built for the **Dashboard Royale challenge at TAMU Datathon 2026**. The Gilded Ace is a fictional Las Vegas casino with 300 slot machines. Management wants to replace the ten lowest earners. This interactive dashboard asks whether low earnings are better explained by limited time on the floor, quiet locations, downtime, or unusual payouts.

**[Open the dashboard](https://gilded-ace-two.vercel.app/)** · [Challenge guide and dataset](https://github.com/tamu-datathon-org/dashboard-royale/blob/5f9274bdc3efa6614e6c081becaeadda34c57a32/GUIDE.md)

## What the dashboard found

- **Cancel the blanket replacement.** Nine of the ten lowest earners were in quiet zones. M-1158 was the only cabinet flagged for an unusual payout gap. Its observed casino win was about **$36,165 below** what its configured payout rate implied, which warrants a meter and paytable check.
- **The raw list is not the weak list.** Ranked by expected win per available hour against same-game cabinets in the same zone, with thin records shrunk toward average, only 1 of the raw bottom ten (M-1120) is in the adjusted bottom ten. No cabinet's configured payout rate differs from the published game math, and none changed configuration mid-period.
- **Measure both banks after a move.** All four destination banks gained in the historical comparisons, and only two source–destination pairs gained overall. A busier destination alone gives an incomplete picture.
- **Fund one inspection.** The July plan allocates **$1,200** to inspect M-1158 and holds **$98,800** in reserve. It defers a relocation and sets a break-even requirement for a promotion pilot.

## Explore the dashboard

Navigation sits in a collapsible left sidebar (a drawer on phones); the top bar's search box (press `/`) sends any question to the floor assistant, and each page header carries its month and bank filters. The dashboard opens on an **Overview** of the recommendation. Each analysis tab is split into sub-tabs so only one topic is on screen at a time. Every statistic has an **i** icon that explains it in plain language, and the **Ask** button (bottom right) opens a floor assistant that summarizes any tab, machine or action from the dashboard's own data and points at it on the Evidence map. The assistant runs entirely in the page, with no AI service.

| View | Sub-tabs | What you can do |
| --- | --- | --- |
| **Overview** | — | Read the July recommendation and jump to the evidence behind each action. |
| **Evidence map** | — | Follow the flow from data sources to evidence (grouped by question), actions and the July plan; hover any box to trace its line of evidence and open it. |
| **Machine audit** | Bottom-ten verdicts · Adjusted ranking · Machine file & floor map · How to read the audit | Expand the bottom-ten verdicts, filter by bank or month, and inspect the evidence behind each recommendation. |
| **Demand & uptime** | Demand trend · Zones & context · Downtime impact · Repairs & tickets · Response times · Event days | Compare wagering trends with event timing, traffic, and estimated downtime exposure; split the April→June change by zone, see when the floor plays, and test weather and the Missouri market as competing explanations. See which days and weekday hours machines are down, how fast faults are answered with one technician on duty versus two, and which downtime a technician shift or preventive maintenance could avoid. |
| **Guests & comps** | Player concentration · Comps & loyalty | Explore tracked wagering, player concentration, and loyalty costs by guest segment. |
| **Model validation** | Holdout test · Staffing calls · July forecast | Compare weekday averages with a seven-day lag and a constant forecast on a 61-day holdout, then see how each forecast changes simulated staffing calls. |
| **July decision** | Action summary · Inspect & defer · Past moves · Promotion · Full catalog | Review the budget, compare historical relocations, and test repair quotes under different recovery assumptions. |

The analysis uses synthetic casino data from January–June 2025, with separately attributed real-world Las Vegas context. See [Claims and Evidence](CLAIMS-AND-EVIDENCE.md) for sources, calculations, limitations, and AI-use disclosure.

## Reproduce locally

Run these commands from the repository root with **Python 3.11–3.13**, **Node.js 18 or later** and **Git**. The build pins the official challenge data to the revision used in the analysis.

```bash
git clone https://github.com/tamu-datathon-org/dashboard-royale.git official-data
git -C official-data checkout 5f9274bdc3efa6614e6c081becaeadda34c57a32
python -m pip install 'pandas==2.2.3' 'numpy==2.3.5'
python build_data.py official-data   # writes data/dashboard.json
npm ci
npm run build                        # writes dist/index.html with the data inlined
npm run check                        # recomputes every figure quoted in README.md and CLAIMS-AND-EVIDENCE.md
```

Or run `bash scripts/vercel-build.sh`, which does the same steps in a throwaway virtual environment. Vercel runs this script on every deploy (see [`vercel.json`](vercel.json)), so pushing to `main` publishes a freshly built dashboard.

Open `dist/index.html` in a browser. The generated page embeds its data and works offline. For live editing, run `npm run dev` after `build_data.py`; the dev server serves `data/dashboard.json`.

## Code layout

```text
build_data.py            prepares the challenge data and forecast holdout → data/dashboard.json
scripts/inject-data.mjs  inlines that JSON into the single-file React build → dist/index.html
src/
├── lib/format.js        number formatting and list helpers
├── lib/model.js         dataset-wide analysis (audit statistics, forecast scores, July economics), computed once
├── nav.jsx              view state, URL-hash links, back/forward, evidence jumps
├── lib/evidence.js      the evidence graph (sources → evidence → actions → plan) shared by map and assistant
├── lib/info.js          plain-language text for every "i" icon
├── assistant/           the built-in floor assistant (answer engine, chat panel, map pointer)
├── components/          shared Panel, Card, Table, Chart (line / column / baseline), Info icon, sub-tab bar
├── App.jsx              header, tabs, filters, view transitions
└── tabs/                Overview, EvidenceMap, Audit, Demand, Guests, Model, Plan
```
