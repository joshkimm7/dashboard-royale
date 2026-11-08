// Claims & evidence: the claims appendix as a readable trail, claim → table and calculation → result → alternative
// and limitation, with a button from each claim to the dashboard view that holds its evidence.
import { useMemo } from 'react';
import { useModel } from '../modelContext.js';
import { revealSection, useNav } from '../nav.jsx';
import { by } from '../lib/format.js';
import { buildClaims } from '../lib/claims.js';
import { Note, Panel } from '../components/ui.jsx';

function EvidenceButton({ link }) {
  const nav = useNav();
  const open = () => link.machine ? nav.openEvidence(link.machine, link.section) : nav.trace(link.section ?? link.goto);
  return <button className="claim-link" data-trace={link.section ?? link.goto} onClick={open}>{link.label + ' →'}</button>;
}

const sentence = text => text.charAt(0).toUpperCase() + text.slice(1);

function ClaimRow({ c }) {
  return (
    <article className="claim" id={c.id} tabIndex={-1} aria-labelledby={c.id + '-title'}>
      <h3 id={c.id + '-title'}>{c.claim}</h3>
      <dl className="claim-grid">
        <div><dt>Table and calculation</dt><dd>{c.method}</dd></div>
        <div className="claim-result"><dt>Result</dt><dd><ul>{c.result.map((r, i) => <li key={i}>{sentence([r].flat().join(''))}</li>)}</ul></dd></div>
        <div><dt>Alternative and limitation</dt><dd>{c.alt}</dd></div>
      </dl>
      <div className="claim-links" aria-label={'Evidence for: ' + c.claim}>
        <span className="claim-links-label">See the evidence</span>
        {c.evidence.map(link => <EvidenceButton key={link.label} link={link} />)}
      </div>
    </article>
  );
}

export default function Claims() {
  const m = useModel();
  const claims = useMemo(() => buildClaims(m), [m]);
  const groups = [...by(claims, c => c.group).entries()];
  return (
    <div className="stack">
      <Panel title="Claim-by-claim evidence trail">
        <Note>{'Each of the ' + claims.length + ' claims in the written appendix, with the calculation behind it, the computed result, and the competing explanation or limitation. ' +
          'Results are January–June, whole floor and all guests, recomputed from the data; npm run check fails if any figure here stops matching CLAIMS-AND-EVIDENCE.md. ' +
          'Evidence buttons open the view at the full period.'}</Note>
        <nav className="claim-toc" aria-label="Claim groups">
          {groups.map(([group, list]) => <a key={group} href={'#section=' + list[0].id} onClick={e => { e.preventDefault(); revealSection(list[0].id); }}>{group + ' (' + list.length + ')'}</a>)}
        </nav>
        {groups.map(([group, list]) => (
          <section key={group} className="claim-group" aria-label={group}>
            <h3 className="claim-group-title">{group}</h3>
            {list.map(c => <ClaimRow key={c.id} c={c} />)}
          </section>
        ))}
      </Panel>
    </div>
  );
}
