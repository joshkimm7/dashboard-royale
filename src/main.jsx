import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createModel } from './lib/model.js';
import './styles.css';

// Production builds inline the dataset into #data (scripts/inject-data.mjs); dev fetches it.
async function loadData() {
  const inline = document.getElementById('data')?.textContent.trim() ?? '';
  if (inline && !inline.startsWith('/*')) return JSON.parse(inline);
  const response = await fetch('/data.json');
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

const root = createRoot(document.getElementById('root'));
loadData()
  .then(data => root.render(<StrictMode><App model={createModel(data)} /></StrictMode>))
  .catch(error => root.render(<main className="wrap"><p className="muted">Could not load dashboard data: {String(error.message)}</p></main>));
