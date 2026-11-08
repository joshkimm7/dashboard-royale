# Video script: 2-minute walkthrough

Record at 1440 × 900 from the public dashboard, https://gilded-ace-two.vercel.app/ (or `dist/index.html` locally). Each shot lists the on-screen action, the URL hash it lands on and the narration. Only the lines marked **Narration** are spoken; they total under 300 words (about 2 minutes at 150 words per minute). Status: script ready, recording pending.

## 0:00–0:12 · The question

- **On screen:** Overview opens on the headline "Cancel the blanket replacement." Hover the four cards (July reserve, Cabinets to inspect, Lowest earners in quiet zones, Forecast improvement). Hash: none.
- **Narration:** The Gilded Ace wanted to replace its ten lowest-earning slots. We asked why they earn so little: luck, location, downtime or a payout fault. The short answer is on the Overview: cancel the blanket replacement.

## 0:12–0:24 · Judge action 1: change the period

- **On screen:** Sidebar → **Q1 · Machine audit**. In the filter bar click the **Q2** quick-period button; the scope pill changes to 2025-04-01 to 2025-06-30. Hash: `#tab=audit&from=3`.
- **Narration:** To change the period, open the Machine audit and click Q2. Every table and chart now covers April to June, and the link in the address bar keeps that view.

## 0:24–0:40 · Judge action 2: drill into a bank or a guest group

- **On screen:** Pick **B-07 · Center Pit** in the **Bank** menu; the **Bank profile · B-07** panel opens at the top. Hash: `#tab=audit&from=3&bank=B-07`. Click **Reset filters**, then sidebar → **Q4/Q5 · Guests & comps**, set **Home region** to Local and **Opening tier** to Gold. Hash: `#tab=guests&region=Local&tier=Gold`.
- **Narration:** Pick a bank and a profile opens with its machines, demand per hour, downtime and trend. For guests, open Guests and comps and choose a home region and tier. Every card recomputes for that group.

## 0:40–0:58 · Judge action 3: find the forecast validation

- **On screen:** Sidebar → **Overview**, click **How the forecast was validated →**. Lands on **Model validation › Holdout test**, panel "A fair test on future days". Hash: `#tab=model&section=holdout-check`. Then click the **Staffing calls** sub-tab.
- **Narration:** How the forecast was validated opens the holdout test. Weekday averages trained on January to April missed by $68,699 a day on 61 unseen days, against $82,070 for last week's number. The gain is modest, and Staffing calls shows how it sets July staffing.

## 0:58–1:16 · Judge action 4: trace a recommendation to its evidence

- **On screen:** Sidebar → **Overview**, click **View payout evidence** on card 01. Lands on **Machine audit › Machine file & floor map** for M-1158, scrolled to its hold chart. Hash: `#tab=audit&sub=machine&machine=M-1158&section=hold-check`. Then sidebar → **Evidence map** (hash `#tab=map`), scroll the **Inspect M-1158** action box into view and hover it; its sources (meters, game math, sessions, catalog) and evidence boxes light up.
- **Narration:** To trace a recommendation, click View payout evidence. M-1158 won $36,165 less than its configured hold and paid on far more spins than its published game math. On the Evidence map, hovering the action lights every link from data to decision.

## 1:16–1:55 · The priced actions

- **On screen:** Sidebar → **Q6 · July decision** (opens **Action summary**). Point at the **July action summary** table, then scroll to the **July budget ledger**. Click **Trace the claim →** on the Inspect M-1158 row; it opens **Claims & evidence** at that claim. Hash: `#tab=claims&section=claim-m1158`. Back to **Q6 · July decision**, click the **Promotion** sub-tab, then **Inspect & defer**.
- **Narration:** July funds one action: a $1,200 inspection of M-1158. If a fault is fixed, July recovery is $5,794, so it pays at a 20.7% chance. We keep $98,800 in reserve, and the ledger checks every catalog rule. The $15,000 promotion weekend stays unfunded unless registrations by July 4 show it can keep 25.3% of the weaker past lift. Moving M-1181 is deferred: it nets $196 at 50% capture and loses $6 if it pulls 10% of play from other machines, and past moves were mixed.

## 1:55–2:00 · Close

- **On screen:** Click the **Build your own plan** sub-tab. Hash: `#tab=plan&sub=builder`.
- **Narration:** Build your own plan prices any alternative, and npm run check recomputes every quoted number.
