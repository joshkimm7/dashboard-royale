// Hover explanations for the dashboard's "i" icons, keyed by the label each component already shows.

export const CARD_INFO = {
  'July reserve': 'Money from the $100,000 July budget that stays unspent after funding the one payout inspection. It waits for stronger evidence before backing a move, promotion or replacement.',
  'Lowest earners in quiet zones': 'How many of the ten lowest earners sit where comparable machines see less than 80% of normal floor play. A high count points to location, not broken cabinets.',
  'Forecast improvement': 'How much smaller the average daily miss is when staffing from weekday averages instead of copying the same day last week, tested on 61 days the model never saw.',
  // Machine audit
  'Bottom cohort': "How many cabinets the audit treats as the lowest earners, out of every cabinet that played in the selected months and bank. Ranking uses actual house win with no adjustment for time on the floor.",
  'Cabinets to inspect': "Bottom-ten cabinets whose house win fell short of their payout settings by more than luck explains (q-value under 0.05) and stayed short in both halves of the period.",
  'Cabinets with weak local demand': "Bottom-ten cabinets that took in under 80% of the wagers that same-game cabinets nearby took over the same hours. Cabinets need a nearby benchmark for at least half their hours to qualify.",
  'Bottom cohort downtime': "Hours the ten lowest earners were unavailable during scheduled time. The dollar figure estimates the wagers those hours would have drawn, based on each cabinet's own play on comparable days, or its peers' when history is thin.",
  // Demand & uptime
  'Coin-in': "Every dollar wagered on the slot floor in the selection. Credits that players won and bet again count each time, so coin-in runs higher than the cash players brought.",
  'Out-of-service time': "Machine hours lost because cabinets were down when they should have been available, added up across every cabinet in the selection.",
  'Estimated coin-in at risk': "Wagers the floor probably missed while machines were down. Each lost hour is priced at that cabinet's usual wager rate on fully available days of the same weekday.",
  'Estimated theo at risk': "The house's expected share of the wagers at risk, using each cabinet's configured hold. It assumes every lost wager would have been played, so treat it as a ceiling.",
  // Guests & comps
  'Carded coin-in': "Wagers recorded on loyalty cards for the selected region, tier and months. Uncarded play is missing, so this is smaller than total floor coin-in.",
  'Returned to players': "What machines paid back to loyalty-card players on their tracked wagers. Set it against carded coin-in to see how much the house kept from that play.",
  'Player net': "Card players' combined payouts minus their wagers. A negative number is the amount these guests lost to the house overall, with winners and losers netted together.",
  'Property comp cost': "What the property actually spent to supply redeemed comps across the whole floor in the selected months. Face value is the retail price guests saw. Region and tier filters don't change it.",
  // Model validation
  'Weekday forecast MAE': "Average dollar miss per day for a forecast that predicts each day's wagers as the January to April average for that weekday. It was scored on 61 May and June days it never saw.",
  'Same weekday last week MAE': "Average daily dollar miss when the forecast simply repeats the actual total from seven days earlier. It is the simple benchmark the weekday forecast has to beat.",
  'Error reduction': "How much smaller the weekday forecast's average miss was than the last-week benchmark's, as a share of the benchmark's miss. Higher means the weekday forecast did better.",
  'Calendar-adjusted MAE': "Average daily dollar miss for the weekday forecast after adding adjustments for federal holidays and events announced in advance. Compare it with the plain weekday forecast to see if the flags helped.",
  // July decision
  'Inspection · 1 unit': "Catalog price for one meter and paytable inspection on M-1158, including any July charges after its lead time. It is the only spending the plan commits to.",
  'Relocation · deferred': "What moving M-1181 to the vacant slot would cost if approved later, including any recurring July charges. The plan holds off because past moves gave mixed results.",
  'Reserve': "The part of the $100,000 July budget left unspent after paying for the inspection. It stays available if stronger evidence supports another action.",
  'Move break-even': "Share of the expected-win gap between M-1181's current spot and similar cabinets at the destination that the move must capture to cover its cost and disruption, assuming no play is pulled from other machines.",
};

export const LINE_INFO = {
  // Machine file
  'Banks during selection': "The floor banks this cabinet sat in during the selected months. More than one bank means it was moved during the period.",
  'Zones during selection': "The floor zones this cabinet occupied in the selected months. Zone matters because the audit compares the cabinet with same-game machines in the same zone.",
  'Latest slot in selection': "The floor position the cabinet held on its last day in the selected months, written as bank and slot number.",
  'Expected house win': "What the house should have kept given the cabinet's wagers and its configured payout settings. Compare it with actual house win to spot a payout shortfall.",
  'Coin-in per available hour': "Total wagers divided by the hours the cabinet was working and open for play. Downtime is left out, so a cabinet that broke often isn't penalized for it here.",
  'Review signals': "Screening flags this cabinet triggered: a persistent payout shortfall, short time on the floor, over 2% downtime, a quiet zone, or weak demand against nearby peers.",
  'Observed vs configured hold': "Share of wagers the house actually kept, next to the share its payout settings say it should keep over time. A big shortfall can point to a meter or paytable problem.",
  'Hold gap, approximate 95% interval': "Plausible range for the true difference between actual and configured hold, in percentage points (pp), based on week-to-week swings. A range entirely below zero means the shortfall is hard to blame on luck.",
  'Adjusted q · weeks with play': "The q-value is a significance score adjusted for testing every cabinet at once; below 0.05 suggests more than luck. Weeks with play shows how much data stands behind it.",
  'Hold gap, first / second half': "The hold shortfall or surplus in each half of the cabinet's time in the selection. A gap that shows up in both halves is less likely to be one bad stretch.",
  'Zone peers vs floor peers': "How busy same-game cabinets in this zone were compared with the same game across the whole floor over the same hours. Below 80% marks a quiet placement.",
  'Hours with zone-specific benchmark': "Share of the cabinet's available hours that had a same-zone comparison, from same-day peers or a 28-day history. The demand flags need at least 50%.",
  'Availability': "Share of scheduled hours the cabinet was up and playable. Downtime above 2% of scheduled time triggers the downtime flag.",
  'Estimated downtime coin-in / theo': "Wagers this cabinet likely missed while down, priced at its own rate on fully available days, and the house's expected share of those wagers.",
  'Contribution after supplied machine costs': "House win after subtracting the machine costs provided in the challenge data. It reflects what the cabinet earned, not what it should have earned at its settings.",
  // Weekly payout check
  'Weeks below expectation': "Weeks where M-1158 kept less than its payout settings called for. Read it against the total weeks shown; a steady fault would push most weeks below.",
  'Payout gap after dropping the worst week': "The full-period hold gap recalculated without the single week that fell furthest below expectation. If it barely moves, one jackpot or bad week isn't driving the result.",
  'Full-period payout gap': "Actual house win minus configured expected win, divided by total wagers, for January to June. Shown in percentage points of every dollar wagered.",
  'Peers with gaps as low as M-1158': "How many comparable cabinets had a payout gap as negative as M-1158's. Peers run the same game, played every week and took 50% to 200% of its wagers.",
  'Median peer payout gap': "The middle payout gap among comparable same-game cabinets. Close to zero means the game itself generally pays out as configured.",
  'Peer range': "Lowest to highest payout gap among comparable same-game cabinets. If M-1158 falls well outside this range, the game's normal variation doesn't explain it.",
  'Sensitivity interval and adjusted q': "The 95% range and false-alarm-adjusted q-value recalculated after removing the worst week. A range still below zero with a small q means the finding holds up.",
  'Largest adjusted q after dropping any one week': "Each week is removed in turn and the q-value recalculated; this is the weakest result. If it stays small, no single week is responsible for the flag.",
  // Demand across the period
  'Observed entrances per day · April to June': "Change in average daily door counts from April to June. Counts are crossings, not unique guests, so treat this as a rough traffic gauge.",
  'Adjusted wagers per observed entrance · April to June': "Change in adjusted daily wagers per door crossing from April to June. Negative means each visit produced less play, on top of any drop in traffic.",
  // Can downtime explain the demand trend?
  'Average daily wagers at risk': "Estimated wagers lost to machine downtime, averaged per day across the selection. Compare it with the size of the demand change to judge whether downtime could matter.",
  'Raw Feb–Jun change · wagers/day vs downtime risk/day': "June minus February, unadjusted: the change in average daily wagers next to the change in daily wagers lost to downtime. A small downtime change can't explain a large wager change.",
  'Change in adjusted wagers per day': "Last selected month minus the first in daily wagers, after removing event days and giving each weekday equal weight.",
  'Change in adjusted downtime risk per day': "Last selected month minus the first in daily wagers lost to downtime, adjusted the same way as wagers. Negative means downtime cost less later in the period.",
  'Adjusted wager change even with no modeled downtime': "The adjusted wager change if every wager lost to downtime in both months had been played. A remaining decline means downtime alone can't explain the trend.",
  // Who accounted for play and losses
  'Top 1% of players by wagers': "Share of all tracked wagers that came from the 1% of active card players who wagered the most. Higher means play leans more heavily on a few guests.",
  'Top 1% by losses': "Share of all losses by losing players that came from the 1% of active players who lost the most. This is a separate ranking from the wager list.",
  'Active players ahead / behind / even': "Card players with tracked wagers, split by whether their payouts over the selected months beat, fell short of, or matched what they wagered.",
  'Cardholders with zero recorded wagers': "Loyalty members in the selected group and months who show no tracked wagers. They hold cards but have no recorded slot play here.",
  'Gross losses among losing players': "Total lost by players who ended behind, without subtracting what winning players took home. It is larger than the house's net take from carded play.",
  // What comps actually cost
  'Selected group cost': "What the property spent to supply the comps redeemed by players in the selected region, tier and months.",
  'Group comp face value': "Retail value of the comps that group redeemed, meaning the price a guest would see. The property's real cost is a fraction of it.",
  'Selected group comp cost / expected win from that group’s carded play': "Comp spending as a share of what the house should keep from these players' tracked wagers at configured payout settings. Higher means rewards eat more of the group's value.",
  'Property cost / face value': "What the property paid per dollar of comp face value redeemed across the floor. A steady rate means rising comp cost comes from more redemptions, not pricier items.",
  // Why keep the rest?
  'Bottom-ten cabinets flagged for quiet placement': "Lowest earners over January to June whose zone drew under 80% of the play that the same game drew across the floor. Low earnings there point to location, not the cabinet.",
  'Bottom-ten cabinets flagged for downtime': "Lowest earners over January to June that were unavailable for more than 2% of scheduled time. Zero means breakdowns don't explain their low earnings.",
  // The decision and its evidence
  'Observed / configured hold': "For M-1158 over January to June: the share of wagers the house actually kept, next to the share its payout settings say it should keep.",
  'House win below configured expectation': "How much less M-1158 kept than its wagers and payout settings implied over January to June. This is the shortfall an inspection would try to explain.",
  'Coin-in per hour vs local peers': "M-1158's wagers per available hour against same-game cabinets in its zone. Above 100% means players used it normally, so weak demand doesn't explain its low win.",
  'Historical payout shortfall per day': "M-1158's total shortfall against its configured hold, divided by its days on the floor in the audit.",
  '30 days at the historical gap': "The daily shortfall carried over a full 30-day month, before allowing for the inspection lead time.",
  'Conditional July recovery after lead time': "What July could recover if the inspection finds a real fault and fixes it fully, counting only days after the lead time and assuming play like January to June.",
  'Break-even chance of full correction': "Inspection cost divided by the conditional July recovery. If the odds of finding and fully fixing a fault are higher than this, the inspection pays for itself in July.",
  'Target slot': "The vacant floor position proposed for M-1181, with the bank and slot ID and the date it became free.",
  'June theo per available hour': "Expected house win per working hour in June for M-1181 where it sits now, next to same-game cabinets in the destination zone. The difference is what a move hopes to capture.",
  'Same-config destination cabinets': "How many same-game cabinets in the destination zone played in June and set the destination benchmark. Fewer cabinets make that benchmark less reliable.",
  // Relocation economics with displaced play
  'Break-even placement capture at 0% / 25% displacement': "Share of the placement gap the move must capture to pay off in July, first assuming no play is taken from other machines, then assuming a quarter of the gain is.",
  // Promotion weekend evidence
  'Catalog terms': "Price per promotion weekend, the notice it needs before it can run, and the most weekends the catalog allows in July.",
};

export const PANEL_INFO = {
  // Machine audit
  'Bottom-ten verdicts': "Each low earner gets one main reason, from payout, downtime, short floor time or location, plus a suggested action. Cabinets without a flag are simply monitored.",
  'Machine file': "One cabinet's record for the selected months: where it sat, how it earned against its settings and its neighbors, and which screening flags it triggered.",
  'Floor banks by zone': "A floor map grouped by zone. Use it to see whether low earners cluster in one area, and click a bank to narrow the audit and demand views to it.",
  'M-1158 · Weekly payout check': "Tests whether M-1158's shortfall is steady or driven by a few weeks. It compares each week with its settings and with cabinets running the same game.",
  'How to read the audit': "Method notes for the audit: how peer benchmarks are built, how the payout gap and its significance are tested, and which cutoffs trigger each flag.",
  // Demand & uptime
  'Demand across the period': "Monthly wagers for the property, with a version that removes event days and evens out the weekday mix so months compare fairly, plus city visitor context.",
  'What drove the raw change in wagers?': "Splits the change in daily wagers into two parts: more or fewer hours of play on the machines, and more or less wagered per hour played. It shows where the change came from, not why.",
  'Can downtime explain the demand trend?': "Checks whether recovering every wager lost to downtime would erase the decline in adjusted wagers. If a decline remains, something besides broken machines is at work.",
  'When downtime cost the most': "Estimated wagers lost to downtime, month by month, with the single worst days listed. Use it to spot whether downtime clusters in time.",
  'Downtime estimate': "How lost wagers are estimated: lost hours times the cabinet's normal rate on fully working days of the same weekday, with a peer rate as fallback.",
  'Where to look for repairs': "Downtime and lost expected win by manufacturer, and fault-ticket hours by shift. Use it to see which makers and shifts carry the most downtime.",
  'Event days vs similar weekdays': "Wagers on each listed event's days compared with event-free days on the same weekday in the same month. A positive figure means the event days ran busier.",
  // Guests & comps
  'Who accounted for play and losses': "How concentrated loyalty-card play and losses are. Each player's months are added together first, so one guest counts once.",
  'What comps actually cost': "Compares what comps cost the property with their retail face value and with the expected win from the players who received them.",
  'Monthly loyalty economics': "Tracks comp spending month by month against slot expected win and against face value, to separate rising redemptions from a change in cost per comp.",
  // Model validation
  'A fair test on future days': "Forecasts trained on January to April are scored on May and June days they never saw, so the error reflects how they would perform when planning ahead.",
  'Does it hold over an earlier window?': "Repeats the comparison from March onward, refitting weekday averages each day with only earlier data. It checks the weekday forecast isn't winning on one lucky stretch.",
  'Staffing decision · holdout replay': "Replays the May and June holdout at several wager cutoffs to show how many busy days each forecast would have staffed for, caught, missed or staffed unnecessarily.",
  'Did the forecast flag the right days?': "Sorts each holdout day into peak, regular or quiet by actual wagers, then counts how often each forecast put the day in the right tier.",
  'Use the forecast to staff routine days': "The July staffing plan built from weekday averages, with each weekday's expected wagers and tier. Holidays and announced events are listed separately.",
  // July decision
  'July action summary': "The three July actions side by side, each with its cost, expected effect, main uncertainty and how the result will be measured afterward.",
  'Why keep the rest?': "Explains why the other low earners stay on the floor: most sit in quiet zones and none breaks down often, so the evidence points to location rather than the cabinets themselves.",
  'The decision and its evidence': "The numbers behind inspecting M-1158 and deferring the M-1181 move, with the inspection timing and a calculator for approving a repair quote.",
  'What happened after past moves?': "Four earlier relocations, comparing 14 days before and after against cabinets and banks that didn't move. It checks both the moved cabinet and the banks on each end.",
  'What past moves tell us about the assumptions': "Checks how much of the pre-move earnings gap past moves actually captured, which tests the capture rates assumed for moving M-1181.",
  'Relocation economics with displaced play': "July net expected win from moving M-1181 across a grid of assumptions about how much of the gap it captures and how much play it pulls from other machines.",
  'Promotion weekend evidence': "Wager and expected-win lift from two past promotions, during the event and the week after, against matched event-free days, and the share a July weekend must repeat to break even.",
  'Decisions across the action catalog': "Every action available in the July catalog with its cost per unit and the reason it was funded, deferred or passed over.",
};

export const CHART_INFO = {
  'Machine file': "Actual house win each month against what the cabinet's payout settings say it should have kept. A win line that keeps sitting below expected win suggests a payout problem rather than bad luck.",
  'M-1158 · Weekly payout check': "Weekly hold gap for M-1158 against the wager-weighted gap of every cabinet running the same game. Zero means paying exactly as configured; points below it mean the house kept less.",
  'Demand across the period': "Average daily wagers by month as recorded, and with event days removed and each weekday weighted equally. The second line shows the underlying trend without calendar quirks.",
  'When downtime cost the most': "Estimated wagers lost to downtime per day, averaged within each month so months of different lengths compare fairly.",
  'Monthly loyalty economics': "Each month's comp cost as a share of the expected win from all slot play. A rising line means rewards are taking a bigger slice of what the floor should earn.",
  'A fair test on future days': "Actual daily wagers for May and June against three forecasts made without seeing those days. The closer a forecast tracks the actual line, the better it would have planned staffing.",
};

export const DECISION_INFO = {
  '01 · Inspect M-1158': "The cost of checking M-1158's meters and paytable. It was the only low earner whose payout shortfall held up across the audit, and it pays off only if a fixable fault turns up.",
  '02 · M-1181 relocation': "Moving M-1181 is put on hold. In past moves the destination bank gained, but losses at the source bank often offset it, so the floor as a whole didn't clearly come out ahead.",
  '03 · Routine staffing': "Add flex staff on days when the weekday forecast reaches the peak-wager cutoff. Events are planned separately because the forecast doesn't account for them well.",
};
