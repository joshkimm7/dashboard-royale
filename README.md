# Dashboard Royale — The Gilded Ace

Build the dashboard using the instructions under [Reproduce](#reproduce), then open `dist/index.html` in a modern desktop browser with JavaScript enabled. The generated file embeds the data and runs offline. Use the opening shortcuts to see the payout stress test and historical moves. The July decision tab shows the budget. The month selectors apply to the descriptive views. Forecast validation and July decision use fixed evidence windows.

## Evidence

[Claims and evidence with AI-use disclosure](CLAIMS-AND-EVIDENCE.md)

## Reproduce

Use Python 3.11 or later and Git. Use the official dataset at commit `5f9274bdc3efa6614e6c081becaeadda34c57a32`. The data is synthetic, except for the separately attributed Las Vegas context. The HTML runs without these build steps.

```bash
git clone https://github.com/tamu-datathon-org/dashboard-royale.git official-data
git -C official-data checkout 5f9274bdc3efa6614e6c081becaeadda34c57a32
python -m pip install 'pandas==2.2.3' 'numpy==2.3.5'
mkdir -p dist
python build_data.py official-data
```

Open `dist/index.html`. The Python script performs the data joins, holdout setup, and data preparation. The source template contains the scope filters, machine screening, charts, and recommendations.
