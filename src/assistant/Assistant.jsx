// Floating "Floor assistant": a bottom-right chat that answers from the dashboard's data and points at the evidence map.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { buildEvidenceGraph } from '../lib/evidence.js';
import { GoButton } from '../tabs/EvidenceMap.jsx';
import { SUGGESTIONS, answer } from './engine.js';
import { setMapFocus } from './focus.js';

const GREETING = {
  from: 'bot',
  text: ['Hi, I’m the floor assistant. Ask me about any part of the review, like “everything about Q2/Q3” or “why inspect M-1158?”, and I’ll summarize it and point at the evidence on the map.'],
  items: [], suggestions: SUGGESTIONS,
};

function BotMessage({ msg, onAsk, onShowMap }) {
  return (
    <div className="chat-msg bot">
      {msg.text.map((p, i) => <p key={i}>{p}</p>)}
      {msg.items.length > 0 && (
        <ul className="chat-items">
          {msg.items.map(it => (
            <li key={it.label}>
              <div><strong>{it.label}</strong>{it.value ? <span className="chat-value"> · {it.value}</span> : null}</div>
              <span className="chat-sum">{it.summary}</span>
              {it.go && <GoButton go={it.go} label="Open" />}
            </li>
          ))}
        </ul>
      )}
      {msg.focus && <button className="chat-map" onClick={() => onShowMap(msg.focus)}>Show on Evidence map →</button>}
      {msg.suggestions && (
        <div className="chat-suggest">{msg.suggestions.map(s => <button key={s} onClick={() => onAsk(s)}>{s}</button>)}</div>
      )}
    </div>
  );
}

export default function Assistant() {
  const m = useModel();
  const nav = useNav();
  const graph = useMemo(() => buildEvidenceGraph(m), [m]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [draft, setDraft] = useState('');
  const logRef = useRef(null), inputRef = useRef(null), toggleRef = useRef(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, open]);

  const ask = question => {
    const q = question.trim();
    if (!q) return;
    const reply = answer(q, graph, m);
    // Point at the boxes right away; on the map tab they light up immediately.
    setMapFocus(reply.focus);
    setMessages(list => [...list, { from: 'user', text: [q] }, { from: 'bot', ...reply }]);
    setDraft('');
  };
  const showOnMap = focus => { setMapFocus(focus); nav.goto('map'); };
  const close = () => { setOpen(false); toggleRef.current?.focus(); };

  return (
    <div className={'assistant' + (open ? ' open' : '')}>
      {open && (
        <section className="chat" role="dialog" aria-label="Floor assistant" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
          <header className="chat-head">
            <span className="chat-mark" aria-hidden="true">♦</span>
            <div><strong>Floor assistant</strong><small>Answers from this dashboard’s data</small></div>
            <button className="chat-close" aria-label="Close assistant" onClick={close}>×</button>
          </header>
          <div className="chat-log" ref={logRef} aria-live="polite">
            {messages.map((msg, i) => msg.from === 'user'
              ? <div key={i} className="chat-msg user"><p>{msg.text[0]}</p></div>
              : <BotMessage key={i} msg={msg} onAsk={ask} onShowMap={showOnMap} />)}
          </div>
          <form className="chat-form" onSubmit={e => { e.preventDefault(); ask(draft); }}>
            <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask about a tab, machine or action…" aria-label="Ask the floor assistant" />
            <button type="submit" disabled={!draft.trim()}>Ask</button>
          </form>
        </section>
      )}
      <button ref={toggleRef} className="assistant-toggle" aria-expanded={open} aria-label={open ? 'Close floor assistant' : 'Open floor assistant'}
        onClick={() => (open ? close() : setOpen(true))}>
        <span aria-hidden="true">{open ? '×' : '♦'}</span><span className="assistant-toggle-label">{open ? 'Close' : 'Ask'}</span>
      </button>
    </div>
  );
}
