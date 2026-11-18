const esc = (value = '') =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const fmtDate = value => {
  if (!value) return '';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
};

const statusLabel = value => String(value ?? 'UNKNOWN').replaceAll('_', ' ');

const voteClass = vote => {
  const v = String(vote ?? '').toUpperCase();
  if (v === 'YEA' || v === 'YES') return 'vote-yea';
  if (v === 'NAY' || v === 'NO') return 'vote-nay';
  if (v === 'ABSENT') return 'vote-absent';
  return 'vote-other';
};

const page = ({ title, body, active = '', signedIn = false }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · LeLegis</title>
<style>
:root{--ink:#0d1b2a;--muted:#607080;--paper:#f8faf8;--wash:#e4ece9;--line:#ccd8d3;--teal:#087f77;--teal-dark:#075f59;--red:#a63b32;--gold:#a77b16;--white:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--wash);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit}.sitebar{position:sticky;top:0;z-index:20;background:rgba(248,250,248,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.nav{max-width:1180px;margin:auto;display:flex;align-items:center;gap:24px;padding:14px 22px}.brand{font:800 25px/1 Georgia,serif;text-decoration:none}
.navlinks{display:flex;gap:8px;margin-left:auto}.navlinks a{padding:9px 12px;border-radius:999px;text-decoration:none;color:var(--muted);font-weight:700;font-size:14px}
.navlinks a.active,.navlinks a:hover{background:#d7e6e1;color:var(--teal-dark)}
.wrap{max-width:1180px;margin:auto;padding:34px 22px 70px}.hero{background:var(--paper);border:1px solid var(--line);border-radius:26px;padding:34px;box-shadow:0 14px 38px rgba(13,27,42,.05)}
.eyebrow{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--teal);font-weight:900}h1,h2,h3{font-family:Georgia,"Times New Roman",serif}
h1{font-size:clamp(42px,7vw,72px);line-height:.98;margin:8px 0 14px}h2{font-size:30px;margin:0 0 16px}h3{font-size:21px;margin:0 0 8px}
.lede{font-size:18px;line-height:1.6;color:var(--muted);max-width:850px}.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.7fr);gap:22px;margin-top:22px}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:24px}.stack{display:grid;gap:14px}
.bill-card{display:block;text-decoration:none;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px;transition:.15s ease}
.bill-card:hover{transform:translateY(-1px);border-color:#9ab8ae;box-shadow:0 8px 20px rgba(13,27,42,.05)}
.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#edf3f0;color:#44554f;font-size:12px;font-weight:800}
.chip.status{background:#dfeee9;color:var(--teal-dark)}.chip.house{background:#e9eef6;color:#334c75}.chip.senate{background:#f2e8e7;color:#7a403a}
.muted{color:var(--muted)}.small{font-size:13px}.search{display:flex;gap:10px;margin-top:22px}.search input{flex:1;border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:white;font:inherit}
button,.button{border:0;border-radius:14px;padding:13px 16px;background:var(--teal);color:white;font-weight:850;text-decoration:none;cursor:pointer}.button.secondary{background:#dce8e4;color:var(--teal-dark)}
.button.dark{background:#121212}.button.apple{background:#000}.button.google{background:white;color:#24313d;border:1px solid var(--line)}
.timeline{display:grid;gap:0}.timeline-item{display:grid;grid-template-columns:110px 16px 1fr;gap:12px;padding:0 0 18px}.timeline-dot{width:10px;height:10px;border-radius:50%;background:var(--teal);margin-top:6px;position:relative}
.timeline-dot:after{content:"";position:absolute;width:2px;background:var(--line);top:12px;bottom:-28px;left:4px}.timeline-item:last-child .timeline-dot:after{display:none}
.vote-card{border:1px solid var(--line);border-radius:18px;padding:18px;background:white}.vote-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px;margin-top:14px}
.member-vote{display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border-radius:10px;background:#f3f6f4;text-decoration:none;font-size:13px}
.vote-yea{color:#0a6a49}.vote-nay{color:#9c2f2a}.vote-absent{color:#7b6d4a}.vote-other{color:#566}.statgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.stat{background:#eef4f1;border-radius:14px;padding:15px}.stat strong{display:block;font-size:22px}.profile-head{display:flex;gap:20px;align-items:center}
.avatar{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:#dce8e4;color:var(--teal-dark);font:700 28px Georgia,serif}
.empty{padding:28px;border:1px dashed #aebdb7;border-radius:16px;color:var(--muted);text-align:center}
.position-box{background:#f2f7f5;border:1px solid var(--line);border-radius:18px;padding:20px}.position-actions{display:flex;gap:10px;margin-top:12px}
.position-button{flex:1;font-size:16px}.position-button.no{background:#9a4139}.position-button.selected{outline:3px solid rgba(8,127,119,.22);outline-offset:2px}
.auth-buttons{display:grid;gap:12px;max-width:430px}.auth-buttons .button{text-align:center;font-size:16px}
.align-row{display:grid;grid-template-columns:1fr auto;gap:15px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}.align-row:last-child{border-bottom:0}
.align-score{font:700 28px Georgia,serif}.footer{max-width:1180px;margin:auto;padding:0 22px 40px;color:var(--muted);font-size:13px}
@media(max-width:800px){.grid{grid-template-columns:1fr}.navlinks{gap:2px}.navlinks a{padding:8px}.timeline-item{grid-template-columns:86px 14px 1fr}.hero{padding:24px}}
</style>
</head>
<body>
<header class="sitebar"><nav class="nav">
<a class="brand" href="/">LeLegis</a>
<div class="navlinks">
<a class="${active==='bills'?'active':''}" href="/bills">Bills</a>
<a class="${active==='legislators'?'active':''}" href="/legislators">Legislators</a>
<a class="${active==='account'?'active':''}" href="${signedIn ? '/account' : '/login'}">${signedIn ? 'My LeLegis' : 'Sign in'}</a>
</div></nav></header>
${body}
<footer class="footer">LeLegis · Louisiana legislative data from official Louisiana Legislature sources.</footer>
</body></html>`;

export function renderHome({ recentBills = [], signedIn = false } = {}) {
  const cards = recentBills.slice(0,6).map(b=>`<a class="bill-card" href="/bills/${encodeURIComponent(b.instrument)}"><div class="meta"><span class="chip ${String(b.origin_chamber).toLowerCase()}">${esc(b.instrument)}</span><span class="chip status">${esc(statusLabel(b.normalized_status))}</span></div><h3 style="margin-top:12px">${esc(b.subject||'No subject')}</h3><div class="muted small">${esc(b.official_description||'')}</div></a>`).join('');
  return page({title:'Louisiana Legislature, made readable',signedIn,body:`<main class="wrap"><section class="hero"><div class="eyebrow">Louisiana Legislature</div><h1>Follow the bills.<br>See the votes.</h1><p class="lede">LeLegis turns Louisiana legislative records into readable bill timelines, committee motions, floor votes, and member voting records.</p><div class="search"><form action="/bills" method="get" style="display:flex;gap:10px;width:100%"><input name="q" aria-label="Search bills" placeholder="Search HB1, taxes, education, insurance..."><button>Search bills</button></form></div></section><section style="margin-top:28px"><div class="meta" style="justify-content:space-between"><h2>Recent bills</h2><a class="button secondary" href="/bills">Browse all bills</a></div><div class="stack">${cards||'<div class="empty">No bills loaded yet.</div>'}</div></section></main>`});
}

export function renderBills({ bills = [], query = '', signedIn = false }) {
  const cards=bills.map(b=>`<a class="bill-card" href="/bills/${encodeURIComponent(b.instrument)}"><div class="meta"><span class="chip ${String(b.origin_chamber).toLowerCase()}">${esc(b.instrument)}</span><span class="chip status">${esc(statusLabel(b.normalized_status))}</span>${b.act_number?`<span class="chip">Act ${esc(b.act_number)}</span>`:''}</div><h3 style="margin-top:12px">${esc(b.subject||'No subject')}</h3><div class="muted">${esc(b.official_description||'')}</div><div class="small muted" style="margin-top:12px">${esc(b.official_status||'')}</div></a>`).join('');
  return page({title:query?`Bills matching ${query}`:'Bills',active:'bills',signedIn,body:`<main class="wrap"><section class="hero"><div class="eyebrow">Bill tracker</div><h1>Bills</h1><form class="search" action="/bills" method="get"><input name="q" value="${esc(query)}" placeholder="Search bill number, subject, description or status"><button>Search</button></form></section><section style="margin-top:22px" class="stack">${cards||'<div class="empty">No matching bills.</div>'}</section></main>`});
}

export function renderBill(bill, { signedIn = false, position = null } = {}) {
  const votes=(bill.vote_events??[]).map(v=>{const tally=v.vote_method==='WITHOUT_OBJECTION'?'Without objection':[v.yea_total!=null?`${v.yea_total} yea`:null,v.nay_total!=null?`${v.nay_total} nay`:null,v.absent_total!=null?`${v.absent_total} absent`:null].filter(Boolean).join(' · ');const members=(v.member_votes??[]).map(m=>`<a class="member-vote" href="/legislators/${m.legislator_id}"><span>${esc(m.display_name)}</span><strong class="${voteClass(m.vote)}">${esc(m.vote)}</strong></a>`).join('');return `<article class="vote-card"><div class="meta"><span class="chip ${String(v.chamber).toLowerCase()}">${esc(v.chamber)}</span><span class="chip">${esc(v.event_type)}</span>${v.sequence_number?`<span class="chip">Roll #${esc(v.sequence_number)}</span>`:''}</div><h3 style="margin-top:12px">${esc(v.motion||'Vote')}</h3><div class="small muted">${fmtDate(v.vote_date)}${v.vote_time?` · ${esc(v.vote_time)}`:''}${tally?` · ${esc(tally)}`:''}</div>${members?`<div class="vote-grid">${members}</div>`:`<div class="small muted" style="margin-top:12px">${v.vote_method==='WITHOUT_OBJECTION'?'No individual roll call was recorded for this motion.':'No individual member votes recorded.'}</div>`}</article>`}).join('');
  const actions=(bill.actions??[]).map(a=>`<div class="timeline-item"><div class="small muted">${fmtDate(a.action_date)}</div><div class="timeline-dot"></div><div><strong>${esc(a.chamber||'')}</strong><div class="muted" style="margin-top:4px">${esc(a.official_text)}</div></div></div>`).join('');
  const author=bill.primary_author?`<a href="/legislators/${bill.primary_author.id}">${esc(bill.primary_author.display_name)}</a> · ${esc(bill.primary_author.party)} · District ${esc(bill.primary_author.district_number)}`:'Not available';
  const positionBox=signedIn?`<section class="position-box"><div class="eyebrow">Your position</div><h3 style="margin-top:6px">Would you vote for this bill?</h3><div class="position-actions"><button class="position-button ${position==='YES'?'selected':''}" data-position="YES">YES</button><button class="position-button no ${position==='NO'?'selected':''}" data-position="NO">NO</button></div><div id="position-status" class="small muted" style="margin-top:10px">${position?`Saved: ${esc(position)}`:'Not rated yet.'}</div></section>`:`<section class="position-box"><div class="eyebrow">Your position</div><h3 style="margin-top:6px">Would you vote for this bill?</h3><p class="muted">Sign in to save your position and compare it with Louisiana legislators.</p><a class="button" href="/login?next=${encodeURIComponent(`/bills/${bill.instrument}`)}">Sign in to vote</a></section>`;
  const positionScript=signedIn?`<script>
document.querySelectorAll('[data-position]').forEach(button=>button.addEventListener('click',async()=>{
  const position=button.dataset.position;
  const r=await fetch('/api/me/positions/${encodeURIComponent(bill.instrument)}',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({position})});
  if(r.status===401){location.href='/login?next=${encodeURIComponent(`/bills/${bill.instrument}`)}';return}
  const data=await r.json();
  if(!r.ok){document.getElementById('position-status').textContent=data.error||'Could not save position.';return}
  document.querySelectorAll('[data-position]').forEach(x=>x.classList.toggle('selected',x.dataset.position===position));
  document.getElementById('position-status').textContent='Saved: '+position;
}));</script>`:'';
  return page({title:`${bill.instrument}: ${bill.subject||'Bill'}`,active:'bills',signedIn,body:`<main class="wrap"><section class="hero"><div class="meta"><span class="chip ${String(bill.origin_chamber).toLowerCase()}">${esc(bill.instrument)}</span><span class="chip status">${esc(statusLabel(bill.normalized_status))}</span>${bill.act_number?`<span class="chip">Act ${esc(bill.act_number)}</span>`:''}</div><h1>${esc(bill.subject||bill.instrument)}</h1><p class="lede">${esc(bill.official_description||'')}</p></section><div class="grid"><div class="stack">${positionBox}<section class="panel"><h2>Votes</h2>${votes||'<div class="empty">No votes recorded.</div>'}</section><section class="panel"><h2>Legislative history</h2><div class="timeline">${actions||'<div class="empty">No actions recorded.</div>'}</div></section></div><aside class="stack"><section class="panel"><h3>Status</h3><div class="muted">${esc(bill.official_status||statusLabel(bill.normalized_status))}</div>${bill.effective_date?`<div class="small muted" style="margin-top:10px">Effective ${fmtDate(bill.effective_date)}</div>`:''}</section><section class="panel"><h3>Primary author</h3><div class="muted">${author}</div></section><section class="panel"><h3>Session</h3><div class="muted">${esc(bill.session?.name||bill.session?.code||'')}</div></section>${bill.source_url?`<a class="button secondary" href="${esc(bill.source_url)}" target="_blank" rel="noreferrer">Official bill page</a>`:''}</aside></div></main>${positionScript}`});
}

export function renderLegislators({ legislators = [], signedIn = false }) {
  const cards=legislators.map(l=>`<a class="bill-card" href="/legislators/${l.id}"><div class="profile-head"><div class="avatar">${esc((l.first_name?.[0]||'')+(l.last_name?.[0]||''))}</div><div><h3>${esc(l.display_name)}</h3><div class="muted">${esc(l.party||'')} · ${esc(l.chamber)} District ${esc(l.district_number)}</div></div></div></a>`).join('');
  return page({title:'Legislators',active:'legislators',signedIn,body:`<main class="wrap"><section class="hero"><div class="eyebrow">Louisiana lawmakers</div><h1>Legislators</h1><p class="lede">Browse lawmakers, authored bills, and recorded votes.</p></section><section class="stack" style="margin-top:22px">${cards||'<div class="empty">No legislators found.</div>'}</section></main>`});
}

export function renderLegislator(profile, { signedIn = false, alignment = null } = {}) {
  const bills=(profile.authored_bills??[]).map(b=>`<a class="bill-card" href="/bills/${encodeURIComponent(b.instrument)}"><div class="meta"><span class="chip">${esc(b.instrument)}</span><span class="chip status">${esc(statusLabel(b.normalized_status))}</span></div><h3 style="margin-top:10px">${esc(b.subject||'No subject')}</h3><div class="small muted">${esc(b.official_description||'')}</div></a>`).join('');
  const votes=(profile.recent_votes??[]).map(v=>`<a class="bill-card" href="/bills/${encodeURIComponent(v.instrument)}"><div class="meta"><span class="chip">${esc(v.instrument)}</span><span class="chip ${voteClass(v.vote)}">${esc(v.vote)}</span><span class="chip">${esc(v.event_type)}</span></div><div style="margin-top:10px"><strong>${esc(v.motion||'Vote')}</strong></div><div class="small muted">${fmtDate(v.vote_date)} · ${esc(v.subject||'')}</div></a>`).join('');
  const align=alignment?`<section class="panel"><div class="eyebrow">Your alignment</div><div class="align-score">${esc(alignment.percent)}%</div><div class="small muted">${esc(alignment.matches)} agreements · ${esc(alignment.disagreements)} disagreements · ${esc(alignment.comparable)} comparable bills</div></section>`:'';
  return page({title:profile.display_name,active:'legislators',signedIn,body:`<main class="wrap"><section class="hero"><div class="profile-head"><div class="avatar">${esc((profile.first_name?.[0]||'')+(profile.last_name?.[0]||''))}</div><div><div class="eyebrow">${esc(profile.chamber)} District ${esc(profile.district_number)}</div><h1 style="margin-bottom:8px">${esc(profile.display_name)}</h1><div class="muted">${esc(profile.party||'')}</div></div></div></section><div class="grid"><section class="panel"><h2>Recent votes</h2><div class="stack">${votes||'<div class="empty">No recorded votes.</div>'}</div></section><aside class="stack">${align}<section class="panel"><h2>Authored bills</h2><div class="stack">${bills||'<div class="empty">No authored bills recorded.</div>'}</div></section></aside></div></main>`});
}

export function renderLogin({ providers, next = '/account' }) {
  const buttons=[];
  if(providers.google) buttons.push(`<a class="button google" href="/auth/google?next=${encodeURIComponent(next)}">Continue with Google</a>`);
  if(providers.apple) buttons.push(`<a class="button apple" href="/auth/apple?next=${encodeURIComponent(next)}">Continue with Apple</a>`);
  const missing=!buttons.length?'<div class="empty">Sign-in providers are not configured yet.</div>':'';
  return page({title:'Sign in',active:'account',body:`<main class="wrap"><section class="hero" style="max-width:620px;margin:auto"><div class="eyebrow">My LeLegis</div><h1>Sign in</h1><p class="lede">Save your Yes/No positions and compare them with Louisiana lawmakers. Your saved positions are private by default.</p><div class="auth-buttons">${buttons.join('')}${missing}</div></section></main>`});
}

export function renderAccount({ user, positions = [], alignment = [] }) {
  const pos=positions.map(p=>`<a class="bill-card" href="/bills/${encodeURIComponent(p.instrument)}"><div class="meta"><span class="chip">${esc(p.instrument)}</span><span class="chip ${voteClass(p.position)}">${esc(p.position)}</span></div><h3 style="margin-top:10px">${esc(p.subject||'')}</h3></a>`).join('');
  const align=alignment.slice(0,15).map(a=>`<a class="align-row" href="/legislators/${a.legislator_id}" style="text-decoration:none"><div><strong>${esc(a.display_name)}</strong><div class="small muted">${esc(a.party||'')} · ${esc(a.chamber)} District ${esc(a.district_number)} · ${esc(a.comparable)} comparable</div></div><div class="align-score">${esc(a.percent)}%</div></a>`).join('');
  return page({title:'My LeLegis',active:'account',signedIn:true,body:`<main class="wrap"><section class="hero"><div class="eyebrow">My LeLegis</div><h1>${esc(user.name||'Your account')}</h1><p class="lede">Your bill positions and alignment results are private unless a future public-profile setting is explicitly enabled.</p><button id="signout" class="button secondary">Sign out</button></section><div class="grid"><section class="panel"><h2>Your positions</h2><div class="stack">${pos||'<div class="empty">You have not rated any bills yet.</div>'}</div></section><aside class="panel"><h2>Best matches</h2>${align||'<div class="empty">Rate bills with recorded floor votes to calculate alignment.</div>'}</aside></div></main><script>document.getElementById('signout').addEventListener('click',async()=>{await fetch('/api/auth/sign-out',{method:'POST'});location.href='/';});</script>`});
}

export function renderNotFound(message='Not found', signedIn=false) {
  return page({title:'Not found',signedIn,body:`<main class="wrap"><section class="hero"><div class="eyebrow">404</div><h1>Not found</h1><p class="lede">${esc(message)}</p><a class="button" href="/">Back to LeLegis</a></section></main>`});
}
