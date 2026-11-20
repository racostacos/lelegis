const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const bar = (n, max) => `<span style="display:block;height:7px;min-width:${n ? '2px' : '0'};width:${max ? Math.max(2, 100*n/max) : 0}%;border-radius:5px;background:#aa3329"></span>`;
const mini = (title, href, data) => {
  const peak = Math.max(1, ...data.map(row => row.count));
  return `<a href="${href}" aria-label="View ${esc(title)} analytics" style="display:flex;flex-direction:column;justify-content:space-between;gap:8px;min-width:0;min-height:100px;border:1px solid #d9dfe0;border-radius:13px;padding:12px;text-decoration:none;color:#0d1b2a;background:white">
    <strong style="font-size:12px">${esc(title)}</strong>
    <span style="display:grid;gap:7px">${data.length ? data.slice(0,3).map(row => `<span style="display:block;background:#f5eeee;border-radius:6px">${bar(row.count,peak)}</span>`).join('') : '<span style="font-size:12px;color:#607080">No data</span>'}</span>
    <span style="font-size:11px;color:#aa3329;font-weight:700">Explore →</span>
  </a>`;
};

export function renderAnalyticsPreview(data) {
  return `<div class="analytics-preview" aria-label="Legislative analytics previews" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:min(100%,405px);align-self:start">
    ${mini('By subject','/analytics#subjects',data.subjects)}
    ${mini('Outcomes','/analytics#outcomes',data.outcomes)}
    ${mini('Activity','/analytics#activity',data.months)}
  </div>`;
}

const chart = (rows, name) => {
  const max = Math.max(1, ...rows.map(r => r.count));
  if (!rows.length) return '<p class="muted">No recorded data for these filters.</p>';
  return `<div style="display:grid;gap:10px">${rows.map(row => `<div style="display:grid;grid-template-columns:minmax(110px,1.2fr) minmax(75px,2fr) 44px;align-items:center;gap:12px;font-size:13px">
    <span style="overflow-wrap:anywhere">${esc(row.label.replaceAll('_',' '))}</span><span style="background:#f4e9e7;border-radius:7px">${bar(row.count,max)}</span><strong style="text-align:right">${row.count}</strong>
  </div>`).join('')}</div>`;
};
const option = (value, label, current) => `<option value="${esc(value)}"${value===current?' selected':''}>${esc(label)}</option>`;

export function renderAnalyticsBody(data) {
  const { filters, sessions } = data;
  return `<main class="wrap">
    <section class="hero">
      <div class="eyebrow">Legislative statistics</div><h1>Analytics</h1>
      <p class="lede">Counts from LeLegis's stored Louisiana Legislature records. Ceremonial commendations and condolences are excluded using the bill tracker's existing rule.</p>
      <form action="/analytics" method="get" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-top:22px">
        <label style="font-size:13px;font-weight:750">Session<br><select name="session" class="field">${sessions.map(s => option(s.session_code,s.session_name || s.session_code,filters.session)).join('')}</select></label>
        <label style="font-size:13px;font-weight:750">Chamber<br><select name="chamber" class="field">${[['ALL','Both'],['HOUSE','House'],['SENATE','Senate']].map(([v,l])=>option(v,l,filters.chamber)).join('')}</select></label>
        <label style="font-size:13px;font-weight:750">Measure type<br><select name="type" class="field">${['ALL','HB','SB','HR','SR','HCR','SCR'].map(v=>option(v,v==='ALL'?'All types':v,filters.type)).join('')}</select></label>
        <button type="submit">Apply filters</button>
      </form>
    </section>
    <section style="margin:26px 0"><div class="eyebrow">Measures in view</div><div style="font:700 42px Georgia,serif">${data.total.toLocaleString('en-US')}</div><div class="small muted">One record per instrument in the selected session.</div></section>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr))">
      <section id="subjects" class="panel"><h2>By subject</h2><p class="small muted">Official subject labels, not inferred policy categories.</p>${chart(data.subjects.slice(0,20))}</section>
      <section id="outcomes" class="panel"><h2>Recorded outcomes</h2><p class="small muted">Stored status values. Adoption of a resolution is not passage of an ordinary bill.</p>${chart(data.outcomes)}</section>
      <section id="activity" class="panel"><h2>Activity over time</h2><p class="small muted">Number of recorded legislative actions by month, not number of unique bills.</p>${chart(data.months)}</section>
      <section id="chambers" class="panel"><h2>Originating chamber</h2>${chart(data.chambers)}</section>
    </div>
    <section id="authors" class="panel" style="margin-top:22px"><h2>Primary authors</h2><p class="small muted">Number of eligible measures credited to each recorded primary author. Counts do not measure legislative effectiveness.</p>
      ${data.authors.length ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th style="padding:10px;border-bottom:1px solid #ccd8d3">Legislator</th><th>Chamber</th><th>Measures</th></tr></thead><tbody>${data.authors.map(a=>`<tr><td style="padding:10px;border-bottom:1px solid #e7eae9"><a href="/legislators/${encodeURIComponent(a.id)}">${esc(a.name)}</a></td><td>${esc(a.chamber)}</td><td>${a.count}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No primary authors recorded for these filters.</p>'}
    </section>
  </main>`;
}
