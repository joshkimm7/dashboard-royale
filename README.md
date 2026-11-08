# The Gilded Ace · Dashboard Royale

Built for the **Dashboard Royale challenge at TAMU Datathon 2026**. The Gilded Ace is a fictional Las Vegas casino with 300 slot machines. Management wants to replace the ten lowest earners. This interactive dashboard asks whether low earnings are better explained by limited time on the floor, quiet locations, downtime, or unusual payouts.

## Open the dashboard

- **Online:** open **https://gilded-ace-two.vercel.app/** in any current browser (Chrome, Edge, Firefox or Safari). Nothing to install or sign in to; it also works in a private window.
- **Offline file:** build once with the steps in [Reproduce locally](#reproduce-locally) (Python 3.11–3.13 and Node.js 18+), then double-click `dist/index.html`. The page embeds all of its data and needs no server or internet connection.

Start on **Overview**, then use the left sidebar. Every view has a shareable URL, so the links in [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) open straight to each step.

Links: [Challenge guide and dataset](https://github.com/tamu-datathon-org/dashboard-royale/blob/5f9274bdc3efa6614e6c081becaeadda34c57a32/GUIDE.md) · [Devpost challenge page](https://tamu-datathon-26-casino-royale.devpost.com/) · [What to submit (guide §8)](https://github.com/tamu-datathon-org/dashboard-royale/blob/5f9274bdc3efa6614e6c081becaeadda34c57a32/GUIDE.md#8-what-to-submit-on-devpost) · [Write-up](WRITEUP.md) · [Claims and evidence appendix](CLAIMS-AND-EVIDENCE.md)

## What the dashboard found

- **Cancel the blanket replacement.** Nine of the ten lowest earners were in quiet zones. M-1158 was the only cabinet flagged for an unusual payout gap. Its observed casino win was about **$36,165 below** what its configured payout rate implied, which warrants a meter and paytable check.
- **The raw list is not the weak list.** Ranked by expected win per available hour against same-game cabinets in the same zone, with thin records shrunk toward average, only 1 of the raw bottom ten (M-1120) is in the adjusted bottom ten. No cabinet's configured payout rate differs from the published game math, and none changed configuration mid-period.
- **Measure both banks after a move.** All four destination banks gained in the historical comparisons, and only two source–destination pairs gained overall. A busier destination alone gives an incomplete picture.
- **Fund one inspection.** The July plan allocates **$1,200** to inspect M-1158 and holds **$98,800** in reserve. It defers a relocation and leaves the $15,000 promotion weekend unfunded unless registrations by July 4 clear its break-even hurdle. A budget ledger shows $1,200 + $98,800 reserve = $100,000 with every catalog rule checked, and a plan builder lets reviewers price their own alternative.

## Explore the dashboard

Navigation sits in a collapsible left sidebar (a drawer on phones); the top bar's search box (press `/`) sends any question to the floor assistant, and each page header carries its month and bank filters. The dashboard opens on an **Overview** of the recommendation. Each analysis tab is split into sub-tabs so only one topic is on screen at a time. Every statistic has an **i** icon that explains it in plain language, and the **Ask** button (bottom right) opens a floor assistant that summarizes any tab, machine or action from the dashboard's own data and points at it on the Evidence map. The assistant runs entirely in the page, with no AI service.

| View | Sub-tabs | What you can do |
| --- | --- | --- |
| **Overview** | — | Read the July recommendation; one-click links to the period filter, the forecast validation and the claims. |
| **Evidence map** | — | Follow data sources → evidence → actions → July plan; hover any box to trace its line of evidence. |
| **Q1 · Machine audit** | Bottom-ten verdicts · Adjusted ranking · Machine file & floor map · How to read the audit | Check each bottom-ten verdict; rank every cabinet against matched peers with luck bounds and the payout-config and hit-frequency checks; pick a bank to open its bank profile. |
| **Q2/Q3 · Demand & uptime** | Demand trend · Zones & context · Downtime impact · Repairs & tickets · Response times · Event days | Split the April→June change by zone and hour, test weather and the Missouri market, see when machines are down and how fast faults are answered with one or two technicians. |
| **Q4/Q5 · Guests & comps** | Player concentration · Comps & loyalty | Filter by home region, opening tier and age band; Lorenz curves, player outcomes, and the May 1 comp repricing. |
| **Model validation** | Holdout test · Staffing calls · July forecast | Weekday forecast vs a seven-day lag and a constant on a 61-day holdout, and how each changes staffing calls. |
| **Q6 · July decision** | Action summary · Inspect & defer · Past moves · Promotion · Full catalog · Build your own plan | Budget ledger with rule checks, the inspection, deferred move and promotion trigger, and a plan builder that prices your own alternative. |
| **Claims & evidence** | — | Every claim with its table and calculation, result, alternative tested and limitation, each linked to the view that shows it. |

The analysis uses synthetic casino data from January–June 2025, with separately attributed real-world Las Vegas context. See [Claims and Evidence](CLAIMS-AND-EVIDENCE.md) for sources, calculations, limitations, and AI-use disclosure.

## Devpost submission checklist

Submit on the [Devpost challenge page](https://tamu-datathon-26-casino-royale.devpost.com/) (linked from the upstream guide after the pinned data commit). Mapped to [guide §8](https://github.com/tamu-datathon-org/dashboard-royale/blob/5f9274bdc3efa6614e6c081becaeadda34c57a32/GUIDE.md#8-what-to-submit-on-devpost).

| §8 item | Where |
| --- | --- |
| Public interactive dashboard | https://gilded-ace-two.vercel.app/ ([opening instructions](#open-the-dashboard), including an offline single-file build) |
| Video walkthrough, 2 minutes or less | Script ready in [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md); recording pending |
| Write-up, 400 words or less | [WRITEUP.md](WRITEUP.md) |
| One ML or time-series method vs a baseline on a time-based holdout | Weekday-average forecast vs seven-day lag and constant, January–April train, May–June holdout: **Model validation** tab, [`build_data.py`](build_data.py), appendix row "Weekday model supports scheduling" |
| All code or transformation steps | This repository: [`build_data.py`](build_data.py), [`src/`](src), [`analysis/`](analysis), [`scripts/`](scripts) |
| Up to 3 priced action types | [Priced actions](CLAIMS-AND-EVIDENCE.md#priced-actions) and **Q6 · July decision**: inspect M-1158 ($1,200), keep $98,800 in reserve, promotion weekend unfunded with a July 4 trigger; the M-1181 move is deferred |
| AI-use disclosure | [Below](#ai-use-disclosure) and in the [appendix](CLAIMS-AND-EVIDENCE.md#ai-use-disclosure) |
| Claims & Evidence appendix | [CLAIMS-AND-EVIDENCE.md](CLAIMS-AND-EVIDENCE.md), also in the dashboard under **Claims & evidence** |

## AI-use disclosure

Two AI tools were used. Every number in the dashboard, the write-up and the claims appendix is computed from the official challenge files, and `npm run check` recomputes each quoted figure from the dashboard's model. A human reviewed the recommendations. The actions are recommendations for the fictional scenario.

- **ChatGPT (OpenAI Codex)** helped build and test the dashboard, develop the analysis, and draft and revise the written submission and claims appendix. User-supplied review comments attributed to Claude informed those revisions.
- **Anthropic Claude Code** rewrote the dashboard in React and did the casino visual design, the Evidence map, the "i" explanations, the floor assistant and the sidebar layout. It ran the integrity pass and wrote the claims check (`npm run check`). It added analyses: the adjusted ranking and luck funnel with the payout-config check, the May 1 comp repricing, guest Lorenz curves and outcomes, zones with weather and the Missouri comparison, downtime timing and technician response, and the M-1158 hit-frequency check with the comp-visit test. It added features: the judge workflow (period on every view, zone filter, bank profile, Claims page) and the July budget ledger, plan builder and sensitivity controls. It drafted the submission documents (WRITEUP.md, VIDEO-SCRIPT.md, this disclosure and the README checklist).

The floor assistant inside the dashboard is not an AI service: it answers from the dashboard's own data in the page.

## Reproduce locally

Run these commands from the repository root with **Python 3.11–3.13**, **Node.js 18 or later** and **Git**. The build pins the official challenge data to the revision used in the analysis.

```bash
git clone https://github.com/tamu-datathon-org/dashboard-royale.git official-data
git -C official-data checkout 5f9274bdc3efa6614e6c081becaeadda34c57a32
python -m pip install 'pandas==2.2.3' 'numpy==2.3.5'
python build_data.py official-data   # writes data/dashboard.json
npm ci
npm run build                        # writes dist/index.html with the data inlined
npm run check                        # recomputes every figure quoted in README.md, CLAIMS-AND-EVIDENCE.md and WRITEUP.md
```

Or run `bash scripts/vercel-build.sh`, which does the same steps in a throwaway virtual environment. Vercel runs this script on every deploy (see [`vercel.json`](vercel.json)), so pushing to `main` publishes a freshly built dashboard.

Open `dist/index.html` in a browser. The generated page embeds its data and works offline. For live editing, run `npm run dev` after `build_data.py`; the dev server serves `data/dashboard.json`.

## Code layout

```text
WRITEUP.md               the 400-word Devpost write-up
VIDEO-SCRIPT.md          the 2-minute walkthrough shot list
CLAIMS-AND-EVIDENCE.md   claims appendix, priced actions, sources and AI-use disclosure
analysis/                exploration scripts and findings behind the hidden-pattern checks
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
