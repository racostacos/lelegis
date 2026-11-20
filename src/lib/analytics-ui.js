import { renderPowerSection } from './power-dashboard.js';

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const bar = (n, max) => `<span style="display:block;height:7px;min-width:${n ? '2px' : '0'};width:${max ? Math.max(2, 100*n/max) : 0}%;border-radius:5px;background:#aa3329"></span>`;
// Compact, distinct previews. Each graphic uses the same stored counts as /analytics.
const mini = (title, href, graphic) => `<a href="${href}" aria-label="View ${esc(title)} analytics" style="display:flex;flex-direction:column;justify-content:space-between;gap:6px;min-width:0;min-height:110px;border:1px solid #d9dfe0;border-radius:13px;padding:10px;text-decoration:none;color:#0d1b2a;background:white">
  <strong style="font-size:12px">${esc(title)}</strong>
  ${graphic}
  <span style="font-size:11px;color:#aa3329;font-weight:700">Explore →</span>
</a>`;

const subjectPreview = rows => {
  if (!rows.length) return '<span style="font-size:12px;color:#607080">No data</span>';
  const peak = Math.max(1, ...rows.map(row => row.count));
  return `<div role="img" aria-label="Top subjects: ${esc(rows.slice(0,3).map(row => `${row.label}: ${row.count}`).join(', '))}" style="display:grid;gap:4px;width:100%">${rows.slice(0,3).map((row, i) => `<div style="display:flex;align-items:center;gap:4px;min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:40px;flex-shrink:0;font-size:9px;color:#607080">${esc(row.label)}</span><span style="height:7px;border-radius:5px;background:#f5eeee;flex:1;overflow:hidden">${bar(row.count,peak).replace('background:#aa3329',`background:${['#aa3329','#c7776f','#dea69f'][i]}`)}</span></div>`).join('')}</div>`;
};

const outcomePreview = rows => {
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  if (!total) return '<span style="font-size:12px;color:#607080">No data</span>';
  const top = rows.slice(0,4);
  const other = rows.slice(4).reduce((sum, row) => sum + Number(row.count || 0), 0);
  const segments = other ? [...top, { label:'Other', count:other }] : top;
  const colors = ['#aa3329','#c7776f','#e0aaa3','#ebd2cd','#80524d'];
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const slices = segments.map((row, i) => {
    const len = Number(row.count) / total * circumference;
    const slice = `<circle cx="38" cy="38" r="${radius}" fill="none" stroke="${colors[i]}" stroke-width="13" stroke-dasharray="${len} ${circumference-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 38 38)"/>`;
    offset += len;
    return slice;
  }).join('');
  return `<svg role="img" aria-label="Recorded outcomes: ${esc(segments.map(row => `${row.label}: ${row.count}`).join(', '))}" viewBox="0 0 76 76" width="70" height="58" style="align-self:center;max-width:100%"><circle cx="38" cy="38" r="${radius}" fill="none" stroke="#f5eeee" stroke-width="13"/>${slices}<text x="38" y="41" text-anchor="middle" font-size="11" font-weight="800" fill="#0d1b2a">${esc(total.toLocaleString('en-US'))}</text></svg>`;
};

const activityPreview = rows => {
  if (!rows.length) return '<span style="font-size:12px;color:#607080">No data</span>';
  const ordered = [...rows].sort((a,b) => String(a.label).localeCompare(String(b.label)));
  const values = ordered.map(row => Math.max(0, Number(row.count || 0)));
  const peak = Math.max(1, ...values);
  const points = values.map((value,i) => `${values.length===1?46:4+i*84/(values.length-1)},${43-37*value/peak}`).join(' ');
  return `<svg role="img" aria-label="Recorded legislative actions by month: ${esc(ordered.map(row=>`${row.label}: ${row.count}`).join(', '))}" viewBox="0 0 92 48" width="100%" height="50" preserveAspectRatio="none" style="max-width:100%"><line x1="3" x2="89" y1="43" y2="43" stroke="#eadbd8" stroke-width="1"/><polyline points="${points}" fill="none" stroke="#aa3329" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>${values.length===1?`<circle cx="46" cy="${43-37*values[0]/peak}" r="3" fill="#aa3329"/>`:''}</svg>`;
};

export function renderAnalyticsPreview(data) {
  return `<div class="analytics-preview" aria-label="Legislative analytics previews" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:min(100%,405px);align-self:start">
    ${mini('By subject','/analytics#subjects',subjectPreview(data.subjects))}
    ${mini('Outcomes','/analytics#outcomes',outcomePreview(data.outcomes))}
    ${mini('Activity','/analytics#activity',activityPreview(data.months))}
  </div>`;
}

const chart = (rows, name) => {
  const max = Math.max(1, ...rows.map(r => r.count));
  if (!rows.length) return '<p class="muted">No recorded data for these filters.</p>';
  return `<div style="display:grid;gap:10px">${rows.map(row => `<div style="display:grid;grid-template-columns:minmax(110px,1.2fr) minmax(75px,2fr) 44px;align-items:center;gap:12px;font-size:13px">
    <span style="overflow-wrap:anywhere">${esc(row.label.replaceAll('_',' '))}</span><span style="background:#f4e9e7;border-radius:7px">${bar(row.count,max)}</span><strong style="text-align:right">${row.count}</strong>
  </div>`).join('')}</div>`;
};
// Chronological action counts, rendered as an accessible, responsive SVG trend.
const activityChart = rows => {
  if (!rows.length) return '<p class="muted">No recorded data for these filters.</p>';
  const sorted = [...rows].sort((a,b) => String(a.label).localeCompare(String(b.label)));
  const values = sorted.map(r => Math.max(0, Number(r.count) || 0));
  const max = Math.max(1, ...values);
  const width = 680, height = 248, left = 58, right = 22, top = 32, bottom = 49;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = i => left + (sorted.length === 1 ? plotW / 2 : i * plotW / (sorted.length - 1));
  const y = n => top + plotH * (1 - n / max);
  const points = values.map((n,i) => `${x(i).toFixed(2)},${y(n).toFixed(2)}`).join(' ');
  const peak = values.indexOf(Math.max(...values));
  const fmt = n => Number(n).toLocaleString('en-US');
  const month = label => {
    const match = /^(\\d{4})-(\\d{2})$/.exec(String(label));
    if (!match) return String(label);
    const index = Number(match[2]) - 1;
    return index >= 0 && index < 12 ? new Date(Date.UTC(Number(match[1]), index, 1)).toLocaleString('en-US',{month:'short',timeZone:'UTC'}) : String(label);
  };
  const grid = [0,0.5,1].map(f => {
    const yy = y(max*f);
    return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#e9dedc" stroke-width="1"/><text x="${left-12}" y="${yy+4}" text-anchor="end" font-size="12" fill="#607080">${esc(fmt(Math.round(max*f)))}</text>`;
  }).join('');
  const circles = sorted.map((r,i) => `<circle cx="${x(i)}" cy="${y(values[i])}" r="5" fill="${i===peak?'#aa3329':'#fff'}" stroke="#aa3329" stroke-width="2.5"><title>${esc(`${r.label}: ${fmt(values[i])} recorded actions`)}</title></circle>`).join('');
  const labels = sorted.map((r,i) => `<text x="${x(i)}" y="${height-17}" text-anchor="middle" font-size="13" fill="#34465a">${esc(month(r.label))}</text>`).join('');
  const peakY = Math.max(17, y(values[peak])-14);
  return `<div style="width:100%;overflow:hidden"><svg role="img" aria-label="Recorded legislative actions by month: ${esc(sorted.map((r,i)=>`${r.label}: ${fmt(values[i])}`).join(', '))}" viewBox="0 0 ${width} ${height}" width="100%" style="display:block;height:auto;max-width:100%;font-family:Arial,sans-serif">
    ${grid}<polyline points="${points}" fill="none" stroke="#aa3329" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}${labels}
    <text x="${x(peak)}" y="${peakY}" text-anchor="middle" font-weight="700" font-size="14" fill="#aa3329">Peak: ${esc(fmt(values[peak]))}</text>
  </svg></div>`;
};
const option = (value, label, current) => `<option value="${esc(value)}"${value===current?' selected':''}>${esc(label)}</option>`;

export function renderAnalyticsBody(data) {
  const { filters, sessions } = data;
  return `<main class="wrap">
    <section class="hero">
      <div class="eyebrow">Legislative statistics</div><h1>Analytics</h1>
      <p class="lede">Counts from LeLegis's stored Louisiana Legislature records. Ceremonial commendations and condolences are excluded using the bill tracker's existing rule.</p>
      <form action="/analytics" method="get" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-top:22px">
        <label style="font-size:13px;font-weight:750">Session<br><select name="session" class="field">${sessions.map(s => option(s.session_code,s.session_code,filters.session)).join('')}</select></label>
        <label style="font-size:13px;font-weight:750">Chamber<br><select name="chamber" class="field">${[['ALL','Both'],['HOUSE','House'],['SENATE','Senate']].map(([v,l])=>option(v,l,filters.chamber)).join('')}</select></label>
        <label style="font-size:13px;font-weight:750">Measure type<br><select name="type" class="field">${['ALL','HB','SB','HR','SR','HCR','SCR'].map(v=>option(v,v==='ALL'?'All types':v,filters.type)).join('')}</select></label>
        <button type="submit">Apply filters</button>
      </form>
    </section>
    ${renderPowerSection(data.power)}
    <section style="margin:26px 0"><div class="eyebrow">Measures in view</div><div style="font:700 42px Georgia,serif">${data.total.toLocaleString('en-US')}</div><div class="small muted">One record per instrument in the selected session.</div></section>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr))">
      <details id="subjects" class="panel" open><summary style="font:700 25px Georgia,serif;cursor:pointer;margin-bottom:12px">By subject</summary><p class="small muted">Official subject labels, not inferred policy categories.</p>${chart(data.subjects.slice(0,20))}</details>
      <details id="outcomes" class="panel" open><summary style="font:700 25px Georgia,serif;cursor:pointer;margin-bottom:12px">Recorded outcomes</summary><p class="small muted">Stored status values. Adoption of a resolution is not passage of an ordinary bill.</p>${chart(data.outcomes)}</details>
      <details id="activity" class="panel" open><summary style="font:700 25px Georgia,serif;cursor:pointer;margin-bottom:12px">Activity over time</summary><p class="small muted">Number of recorded legislative actions by month, not number of unique bills. Hover over a point for details.</p>${activityChart(data.months)}</details>
      <details id="chambers" class="panel" open><summary style="font:700 25px Georgia,serif;cursor:pointer;margin-bottom:12px">Originating chamber</summary>${chart(data.chambers)}</details>
      <details id="parties" class="panel" open><summary style="font:700 25px Georgia,serif;cursor:pointer;margin-bottom:12px">Originating party</summary><p class="small muted">One measure per recorded primary-author party. Measures with unknown or mixed authorship are shown separately.</p>${chart(data.parties ?? [])}</details>
    </div>
    <details id="authors" class="panel" open style="margin-top:22px"><summary style="font:700 25px Georgia,serif;cursor:pointer;margin-bottom:12px">Primary authors</summary><p class="small muted">Number of eligible measures credited to each recorded primary author. Counts do not measure legislative effectiveness.</p>
      ${data.authors.length ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th style="padding:10px;border-bottom:1px solid #ccd8d3">Legislator</th><th>Chamber</th><th>Measures</th></tr></thead><tbody>${data.authors.map(a=>`<tr><td style="padding:10px;border-bottom:1px solid #e7eae9"><a href="/legislators/${encodeURIComponent(a.id)}">${esc(a.name)}</a></td><td>${esc(a.chamber)}</td><td>${a.count}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No primary authors recorded for these filters.</p>'}
    </details>
  </main>`;
}
