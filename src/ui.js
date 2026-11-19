const esc=(value='')=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

const partyInitial=party=>{
  const p=String(party??'').trim().toUpperCase();
  if(['D','DEM','DEMOCRAT','DEMOCRATIC'].includes(p))return 'D';
  if(['R','REP','REPUBLICAN'].includes(p))return 'R';
  if(['I','IND','INDEPENDENT'].includes(p))return 'I';
  return 'O';
};

const lawmakerName=(person,name=null)=>{
  const display=name??person?.display_name??'';
  return `${esc(display)} (${partyInitial(person?.party)})`;
};

const fmtDate=value=>{if(!value)return'';const d=new Date(`${value}T12:00:00`);if(Number.isNaN(d.getTime()))return esc(value);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
const statusLabel=value=>String(value??'UNKNOWN').replaceAll('_',' ');
const voteClass=vote=>{const v=String(vote??'').toUpperCase();if(v==='YEA'||v==='YES')return'vote-yea';if(v==='NAY'||v==='NO')return'vote-nay';if(v==='ABSENT')return'vote-absent';return'vote-other'};
const firstName=name=>String(name??'').trim().split(/\s+/)[0]||'Account';

const page=({title,body,active='',signedIn=false,userName=null})=>`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · LeLegis</title>
<style>
:root{--ink:#0d1b2a;--muted:#607080;--paper:#f8faf8;--wash:#e4ece9;--line:#ccd8d3;--teal:#087f77;--teal-dark:#075f59;--red:#a63b32;--red-dark:#7e2923;--gold:#a77b16;--white:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}
.sitebar{position:sticky;top:0;z-index:20;background:rgba(248,250,248,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}.nav{max-width:1180px;margin:auto;display:flex;align-items:center;gap:24px;padding:14px 22px}.brand{font:800 25px/1 Georgia,serif;text-decoration:none}
.navlinks{display:flex;gap:8px;margin-left:auto}.navlinks a{padding:9px 12px;border-radius:999px;text-decoration:none;color:var(--muted);font-weight:700;font-size:14px}.navlinks a.active,.navlinks a:hover{background:#d7e6e1;color:var(--teal-dark)}
.wrap{max-width:1180px;margin:auto;padding:34px 22px 70px}.hero{background:var(--paper);border:1px solid var(--line);border-radius:26px;padding:34px;box-shadow:0 14px 38px rgba(13,27,42,.05)}
.eyebrow{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--teal);font-weight:900}h1,h2,h3{font-family:Georgia,"Times New Roman",serif}h1{font-size:clamp(42px,7vw,72px);line-height:.98;margin:8px 0 14px}h2{font-size:30px;margin:0 0 16px}h3{font-size:21px;margin:0 0 8px}.lede{font-size:18px;line-height:1.6;color:var(--muted);max-width:850px}
.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.7fr);gap:22px;margin-top:22px}.panel{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:24px}.stack{display:grid;gap:14px}
.bill-card{display:block;text-decoration:none;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px;transition:.15s ease}.bill-card:hover{transform:translateY(-1px);border-color:#9ab8ae;box-shadow:0 8px 20px rgba(13,27,42,.05)}
.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#edf3f0;color:#44554f;font-size:12px;font-weight:800}.chip.status{background:#dfeee9;color:var(--teal-dark)}.chip.house{background:#e9eef6;color:#334c75}.chip.senate{background:#f2e8e7;color:#7a403a}
.muted{color:var(--muted)}.small{font-size:13px}.search{display:flex;gap:10px;margin-top:22px}.search input,.field{flex:1;border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:white;font:inherit}
button,.button{border:0;border-radius:14px;padding:13px 16px;background:var(--teal);color:white;font-weight:850;text-decoration:none;cursor:pointer}.button.secondary{background:#dce8e4;color:var(--teal-dark)}.button.danger{background:var(--red)}.button.danger:hover{background:var(--red-dark)}.button.google{background:white;color:#24313d;border:1px solid var(--line)}
.timeline{display:grid;gap:0}.timeline-item{display:grid;grid-template-columns:110px 16px 1fr;gap:12px;padding:0 0 18px}.timeline-dot{width:10px;height:10px;border-radius:50%;background:var(--teal);margin-top:6px;position:relative}.timeline-dot:after{content:"";position:absolute;width:2px;background:var(--line);top:12px;bottom:-28px;left:4px}.timeline-item:last-child .timeline-dot:after{display:none}
.vote-card{border:1px solid var(--line);border-radius:18px;padding:18px;background:white}.vote-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px;margin-top:14px}.member-vote{display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border-radius:10px;background:#f3f6f4;text-decoration:none;font-size:13px}
.vote-yea{color:#0a6a49}.vote-nay{color:#9c2f2a}.vote-absent{color:#7b6d4a}.vote-other{color:#566}.statgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stat{background:#eef4f1;border:1px solid #dbe7e2;border-radius:16px;padding:18px}.stat strong{display:block;font:700 30px Georgia,serif;margin-top:6px}.stat span{color:var(--muted);font-size:13px;font-weight:750}
.profile-head{display:flex;gap:20px;align-items:center}.avatar{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:#dce8e4;color:var(--teal-dark);font:700 28px Georgia,serif}.empty{padding:28px;border:1px dashed #aebdb7;border-radius:16px;color:var(--muted);text-align:center}
.position-box{background:#f2f7f5;border:1px solid var(--line);border-radius:18px;padding:20px}.position-actions{display:flex;gap:10px;margin-top:12px}.position-button{flex:1;font-size:16px}.position-button.no{background:#9a4139}.position-button.selected{outline:3px solid rgba(8,127,119,.22);outline-offset:2px}.auth-buttons{display:grid;gap:12px;max-width:430px}.auth-buttons .button{text-align:center;font-size:16px}
.align-row{display:grid;grid-template-columns:1fr auto;gap:15px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}.align-row:last-child{border-bottom:0}.align-score{font:700 28px Georgia,serif}
.account-section{margin-top:22px}.member-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.member-card{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;text-decoration:none;background:white;border:1px solid var(--line);border-radius:18px;padding:18px}.member-score{font:700 28px Georgia,serif;text-align:right}.member-score small{display:block;font:700 11px Inter,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.setting-block{border:1px solid var(--line);border-radius:16px;padding:18px;background:white}.form-row{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.field-label{display:grid;gap:6px;font-size:13px;font-weight:800;color:var(--muted)}.danger-zone{border-color:#ddb4b0;background:#fff9f8}.footer{max-width:1180px;margin:auto;padding:0 22px 40px;color:var(--muted);font-size:13px}
@media(max-width:800px){.grid{grid-template-columns:1fr}.navlinks{gap:2px}.navlinks a{padding:8px}.timeline-item{grid-template-columns:86px 14px 1fr}.hero{padding:24px}.statgrid{grid-template-columns:repeat(2,1fr)}.member-grid,.settings-grid{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}}

.bill-detail-wrap{max-width:900px;margin:auto;padding:28px 18px 100px}
.bill-topline{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px}
.bill-back,.bill-share{font-weight:800;color:var(--teal-dark);text-decoration:none;background:none;border:0;padding:0}
.bill-kicker{font:700 17px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--teal-dark);text-decoration:underline;margin-bottom:12px}
.bill-title{font-size:clamp(42px,7vw,64px);line-height:1.03;margin:0 0 26px}
.bill-section{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:26px;margin-top:18px}
.bill-section-title{font-size:34px;margin:0 0 18px}
.road-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
.road-label{font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:#18a89c}
.road-steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;align-items:start;margin:22px 0}
.road-step{min-width:0}.road-node{display:flex;align-items:center}.road-dot{width:28px;height:28px;border-radius:50%;border:4px solid #cbd8d4;background:var(--paper);flex:0 0 auto}.road-line{height:6px;background:#cbd8d4;border-radius:999px;flex:1;margin-left:7px}.road-step.done .road-dot,.road-step.current .road-dot{background:#20aaa0;border-color:#20aaa0}.road-step.done .road-line{background:#20aaa0}.road-step.current .road-line{background:#d9efec}
.road-name{font-size:13px;font-weight:850;margin-top:9px;line-height:1.2}.latest-action{background:#edf3f1;border-radius:16px;padding:18px;line-height:1.55}
.bill-facts{display:grid;gap:0}.bill-fact{display:grid;grid-template-columns:140px 1fr;gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}.bill-fact:last-child{border-bottom:0}.bill-fact-label{color:var(--muted);font-size:13px;font-weight:900;text-transform:uppercase}.bill-fact-value{font-weight:800;text-align:right}
.summary-text{font-size:18px;line-height:1.6;color:#445267}.read-more{display:inline-block;margin-top:12px;font-weight:850;color:var(--teal-dark);text-decoration:none}
.vote-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.vote-choice{background:#edf3f1;border:1px solid var(--line);border-radius:18px;padding:22px;text-align:left;color:var(--ink);transition:background .15s ease,border-color .15s ease,box-shadow .15s ease}.vote-choice .overline{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:900}.vote-choice strong{display:block;font:700 31px Georgia,serif;margin:7px 0}.vote-choice.selected{background:#dff3e7;border-color:#78b592;box-shadow:0 0 0 3px rgba(35,198,107,.16)}.vote-choice.no.selected{background:#f7dedd;border-color:#c97972;box-shadow:0 0 0 3px rgba(166,59,50,.16)}.vote-choice.selected .overline,.vote-choice.no.selected .overline{color:inherit}
.community-box{margin-top:16px;background:#edf3f1;border-radius:16px;padding:18px}.community-head{display:flex;justify-content:space-between;gap:10px}.community-bar{height:14px;background:#f8e7e8;border-radius:999px;overflow:hidden;margin:16px 0}.community-yes{height:100%;background:#23c66b}.community-totals{display:flex;justify-content:space-between;font-weight:900}
.debate-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.debate-tabs{display:flex;gap:8px;margin:16px 0 20px}.debate-tab{background:transparent;color:var(--muted);padding:10px 16px}.debate-tab.active{background:#edf3f1;color:var(--ink)}.comment-form{display:grid;gap:10px;margin-bottom:18px}.comment-form textarea{min-height:100px;resize:vertical}
.comment{display:grid;grid-template-columns:58px 1fr;gap:12px;padding:18px 0;border-top:1px solid var(--line)}.comment:first-of-type{border-top:0}.sway-box{display:grid;justify-items:center;align-content:start;gap:4px;padding-top:3px}.sway-button{background:none;color:var(--muted);font-size:20px;padding:0;border:0}.sway-button.liked{color:var(--teal)}.sway-count{font-weight:900;color:var(--teal)}.comment-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}.comment-name{font-weight:900}.comment-age,.comment-position{color:var(--muted);font-size:13px}.comment-body{font-size:16px;line-height:1.55;margin-top:8px;white-space:pre-wrap}.comment-actions{display:flex;gap:14px;margin-top:10px}.comment-actions button{background:none;color:var(--muted);padding:0;font-size:13px}.reply{margin-left:18px;padding-left:18px;border-left:2px solid var(--line)}
.sticky-vote{display:none}
@media(max-width:800px){
  .bill-detail-wrap{padding:22px 14px 110px}
  .bill-section{padding:22px 18px}
  .road-steps{overflow-x:auto;grid-template-columns:repeat(6,120px);padding-bottom:4px}
  .bill-fact{grid-template-columns:1fr auto}
  .sticky-vote{display:block;position:fixed;z-index:40;left:18px;right:18px;bottom:18px;background:#07111d;color:white;text-align:center;border-radius:16px;padding:17px 20px;font-weight:900;text-decoration:none;box-shadow:0 8px 30px rgba(0,0,0,.22)}
}
@media(max-width:520px){.vote-choice-grid{grid-template-columns:1fr 1fr}.bill-title{font-size:42px}.comment{grid-template-columns:44px 1fr}.bill-section-title{font-size:30px}}

</style></head><body>
<header class="sitebar"><nav class="nav"><a class="brand" href="/">LeLegis</a><div class="navlinks"><a class="${active==='bills'?'active':''}" href="/">Bills</a><a class="${active==='legislators'?'active':''}" href="/legislators">Legislators</a><a class="${active==='account'?'active':''}" href="${signedIn?'/account':'/login'}">${signedIn?esc(firstName(userName)):'Sign in'}</a></div></nav></header>
${body}<footer class="footer">LeLegis · Louisiana legislative data from official Louisiana Legislature sources.</footer></body></html>`;

export function renderHome({recentBills=[],signedIn=false,userName=null}={}){
 const cards=recentBills.slice(0,6).map(b=>`<a class="bill-card" href="/bills/${encodeURIComponent(b.instrument)}">
   <div class="meta">
     <span class="chip ${String(b.origin_chamber).toLowerCase()}">${esc(b.instrument)}</span>
     <span class="chip status">${esc(statusLabel(b.normalized_status))}</span>
     ${!b.has_been_introduced
       ? '<span class="chip" style="background:#fff1cc;color:#765500">No introduction recorded</span>'
       : ''}
     ${!b.has_any_vote
       ? '<span class="chip" style="background:#f4e6e4;color:#8a332d">No official vote recorded</span>'
       : ''}
   </div>
   <h3 style="margin-top:12px">${esc(b.subject||'No subject')}</h3>
   <div class="muted small">${esc(b.official_description||'')}</div>
 </a>`).join('');
 return page({title:'Louisiana Legislature, made readable',signedIn,userName,body:`<main class="wrap"><section class="hero"><div class="eyebrow">Louisiana Legislature</div><h1>Follow the bills.<br>See the votes.</h1><p class="lede">LeLegis turns Louisiana legislative records into readable bill timelines, committee motions, floor votes, and member voting records.</p><div class="search"><form action="/bills" method="get" style="display:flex;gap:10px;width:100%"><input name="q" aria-label="Search bills" placeholder="Search HB1, taxes, education, insurance..."><button>Search bills</button></form></div></section><section style="margin-top:28px"><div class="meta" style="justify-content:space-between"><h2>Recent bills</h2><a class="button secondary" href="/bills">Browse all bills</a></div><div class="stack">${cards||'<div class="empty">No bills loaded yet.</div>'}</div></section></main>`});
}

export function renderBills({
 bills=[],
 query='',
 signedIn=false,
 userName=null,
 myVote='all',
 repVote='all',
 representativeAvailable=false
}={}){
 const filterUrl=(nextRepVote=repVote,nextMyVote=myVote)=>{
   const params=new URLSearchParams();
   if(query)params.set('q',query);
   if(nextRepVote!=='all')params.set('repVote',nextRepVote);
   if(nextMyVote!=='all')params.set('myVote',nextMyVote);
   const qs=params.toString();
   return qs?`/?${qs}`:'/';
 };

 const filterButton=(label,href,active)=>`<a
   class="chip ${active?'status':''}"
   href="${esc(href)}"
   style="text-decoration:none;cursor:pointer;font-weight:800;${active?'':'background:transparent'}"
 >${esc(label)}</a>`;

 const card=b=>`<a class="bill-card" href="/bills/${encodeURIComponent(b.instrument)}">
   <div class="meta">
     <span class="chip ${String(b.origin_chamber).toLowerCase()}">${esc(b.instrument)}</span>
     <span class="chip status">${esc(statusLabel(b.normalized_status))}</span>
     ${b.act_number?`<span class="chip">Act ${esc(b.act_number)}</span>`:''}
     ${!b.has_been_introduced
       ? '<span class="chip" style="background:#fff1cc;color:#765500">No introduction recorded</span>'
       : ''}
     ${!b.has_any_vote
       ? '<span class="chip" style="background:#f4e6e4;color:#8a332d">No official vote recorded</span>'
       : ''}
     ${signedIn&&b.user_voted
       ? `<span class="chip ${voteClass(b.user_position)}">Your vote: ${esc(b.user_position||'')}</span>`
       : ''}
   </div>
   <h3 style="margin-top:12px">${esc(b.subject||'No subject')}</h3>
   <div class="muted">${esc(b.official_description||'')}</div>

   <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#eef3f1;font-size:.84rem;line-height:1.35">
     <strong>Legislative activity:</strong>
     ${!b.has_been_introduced
       ? '<span style="color:#765500;font-weight:800"> Not introduced yet</span>'
       : !b.has_any_vote
         ? '<span style="color:#8a332d;font-weight:800"> Introduced, no official vote yet</span>'
         : '<span style="color:var(--teal-dark);font-weight:800"> Official vote recorded</span>'}
   </div>

   ${signedIn&&b.house_representative_voted
     ? '<div style="margin-top:10px;font-size:.82rem;font-weight:800;color:var(--teal)">See how your representative voted</div>'
     : ''}
   ${signedIn&&b.senate_representative_voted
     ? '<div style="margin-top:6px;font-size:.82rem;font-weight:800;color:var(--teal)">See how your senator voted</div>'
     : ''}
   <div class="small muted" style="margin-top:12px">${esc(b.official_status||'')}</div>
 </a>`;

 const allNeedsVote=signedIn?bills.filter(b=>!b.user_voted):bills;
 const needsVote=signedIn?allNeedsVote.slice(0,150):allNeedsVote;
 const voted=signedIn?bills.filter(b=>b.user_voted):[];

 const repFilter=signedIn&&representativeAvailable?`
   <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:18px 0 10px">
     <span class="small muted" style="font-weight:800;min-width:112px">Representative</span>
     ${filterButton('All',filterUrl('all'),repVote==='all')}
     ${filterButton('Voted',filterUrl('voted'),repVote==='voted')}
     ${filterButton('Not voted',filterUrl('not-voted'),repVote==='not-voted')}
   </div>
 `: '';

 const myFilter=signedIn?`
   <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:10px 0 22px">
     <span class="small muted" style="font-weight:800;min-width:112px">Your vote</span>
     ${filterButton('All',filterUrl(repVote,'all'),myVote==='all')}
     ${filterButton('Voted',filterUrl(repVote,'voted'),myVote==='voted')}
     ${filterButton('Not voted',filterUrl(repVote,'not-voted'),myVote==='not-voted')}
   </div>
 `:'';

 const needsVoteHtml=needsVote.map(card).join('');
 const votedHtml=voted.map(card).join('');

 return page({
   title:query?`Bills matching ${query}`:'Bills',
   active:'bills',
   signedIn,
   userName,
   body:`<main class="wrap">
     <section class="hero">
       <div class="eyebrow">Bill tracker</div>
       <h1>Bills</h1>
       <form class="search" action="/" method="get">
         <input name="q" value="${esc(query)}" placeholder="Search bill number, subject, description or status">
         ${signedIn&&repVote!=='all'?`<input type="hidden" name="repVote" value="${esc(repVote)}">`:''}
         ${signedIn&&myVote!=='all'?`<input type="hidden" name="myVote" value="${esc(myVote)}">`:''}
         <button>Search</button>
       </form>
     </section>

     ${repFilter}
     ${myFilter}

     ${signedIn?`
       ${myVote!=='voted'?`
       <section style="margin-top:26px">
         <div class="meta" style="justify-content:space-between;margin-bottom:14px">
           <div>
             <div class="eyebrow">Needs your vote</div>
             <h2 style="margin:4px 0 0">Needs your vote</h2>
           </div>
           <span class="chip">${esc(needsVote.length)} shown · ${esc(allNeedsVote.length)} remaining</span>
         </div>
         <div class="stack">
           ${needsVoteHtml||'<div class="empty">No bills in this view need your vote.</div>'}
         </div>
       </section>
       `:''}

       ${myVote!=='not-voted'?`
       <section style="margin-top:36px;padding-top:28px;border-top:1px solid var(--line)">
         <div class="meta" style="justify-content:space-between;margin-bottom:14px">
           <div>
             <div class="eyebrow">Completed</div>
             <h2 style="margin:4px 0 0">Voted pile</h2>
           </div>
           <span class="chip">${esc(voted.length)} voted</span>
         </div>
         <div class="stack">
           ${votedHtml||'<div class="empty">You have not voted on any bills in this view yet.</div>'}
         </div>
       </section>
       `:''}
     `:`
       <section class="stack" style="margin-top:22px">
         ${needsVoteHtml||'<div class="empty">No bills match those filters.</div>'}
       </section>
     `}
   </main>`
 });
}

export function renderBill(bill,{signedIn=false,position=null,userName=null,community={yes:0,no:0,total:0,yes_percent:0},comments=[],commentCount=0,stage=0,summaryText=null,summarySources=[],representativeComparisons=[]}={}){
 const stages=['Introduced','In Committee','On the Floor','Passed House','Passed Senate','Signed'];
 const latest=(bill.actions??[]).at(-1);
 const introduced=(bill.actions??[])[0]?.action_date??bill.created_at?.slice?.(0,10)??'';
 const summary=summaryText||bill.official_description||'No summary is currently available from the official Louisiana Legislature record.';
 const status=bill.official_status||statusLabel(bill.normalized_status);
 const stageHtml=stages.map((name,i)=>`<div class="road-step ${i<stage?'done':i===stage?'current':''}"><div class="road-node"><span class="road-dot"></span>${i<stages.length-1?'<span class="road-line"></span>':''}</div><div class="road-name">${esc(name)}</div></div>`).join('');

 const renderComment=(c,isReply=false)=>`<article class="comment ${isReply?'reply':''}" data-comment="${c.id}">
   <div class="sway-box">
     <button class="sway-button ${Number(c.liked_by_user)?'liked':''}" data-like="${c.id}" aria-label="Like comment">▲</button>
     <div class="sway-count">${esc(c.like_count??0)}</div>
   </div>
   <div>
     <div class="comment-meta">
       <span class="comment-name">${esc(c.user_name||'LeLegis user')}</span>
       <span class="comment-age">${esc(fmtDate(String(c.created_at??'').slice(0,10)))}</span>
       ${c.user_position?`<span class="comment-position">· Voted ${c.user_position==='YES'?'Yes':'No'}</span>`:''}
     </div>
     <div class="comment-body">${esc(c.body)}</div>
     <div class="comment-actions">
       ${signedIn?`<button data-reply="${c.id}">Reply</button>`:''}
       <button type="button">Report</button>
       <button type="button">Collapse thread</button>
     </div>
     ${signedIn?`<div id="reply-form-${c.id}" hidden style="margin-top:12px"><textarea class="field" id="reply-body-${c.id}" placeholder="Write a reply"></textarea><button data-submit-reply="${c.id}" style="margin-top:8px">Post reply</button></div>`:''}
     ${(c.replies??[]).map(r=>renderComment(r,true)).join('')}
   </div>
 </article>`;

 const commentsHtml=comments.map(c=>renderComment(c,false)).join('');
 const communityYesPercent=Number(community.yes_percent??0);
 const communityNoPercent=Number(community.total??0)>0?Math.max(0,100-communityYesPercent):0;
 const communityTotal=Number(community.total??0);
 const communityLeadLabel=communityTotal===0
   ? ''
   : Number(community.yes??0)>Number(community.no??0)
     ? `${communityYesPercent}% YES`
     : Number(community.no??0)>Number(community.yes??0)
       ? `${communityNoPercent}% NO`
       : `${communityYesPercent}% SPLIT`;

 return page({
   title:`${bill.instrument}: ${bill.subject||'Bill'}`,
   active:'bills',
   signedIn,
   userName,
   body:`<main class="bill-detail-wrap">
     <div class="bill-topline"><a class="bill-back" href="/">← Bills</a><button class="bill-share" id="share-bill">Share</button></div>
     <div class="bill-kicker">${esc(bill.instrument)}</div>
     <h1 class="bill-title">${esc(bill.subject||bill.instrument)}</h1>

     <section class="bill-section">
       <div class="road-head"><div class="road-label">Road to the floor</div><span class="small muted">How it works</span></div>
       <div class="road-steps">${stageHtml}</div>
       <div class="latest-action"><strong>${latest?`Latest action · ${fmtDate(latest.action_date)}`:'Latest action'}</strong><div class="muted" style="margin-top:6px">${esc(latest?.official_text||status)}</div></div>
     </section>

     <section class="bill-section">
       <div class="eyebrow" style="color:var(--gold)">Bill details</div>
       <div class="bill-facts">
         <div class="bill-fact"><div class="bill-fact-label">Status</div><div class="bill-fact-value">${esc(status)}</div></div>
         <div class="bill-fact"><div class="bill-fact-label">Introduced</div><div class="bill-fact-value">${fmtDate(introduced)}</div></div>
         <div class="bill-fact"><div class="bill-fact-label">Primary author</div><div class="bill-fact-value">${bill.primary_author?`<a href="/legislators/${bill.primary_author.id}">${lawmakerName(bill.primary_author)}</a>`:'Not available'}</div></div>
         ${bill.act_number?`<div class="bill-fact"><div class="bill-fact-label">Act</div><div class="bill-fact-value">Act ${esc(bill.act_number)}</div></div>`:''}
       </div>
       ${bill.source_url?`<a class="button secondary" style="display:block;text-align:center;margin-top:18px" href="${esc(bill.source_url)}" target="_blank" rel="noreferrer">Full bill record on legis.la.gov</a>`:''}
     </section>

     <section class="bill-section">
       <div class="eyebrow" style="color:var(--gold)">Bill summary</div>
       <p class="summary-text">${esc(summary)}</p>
       ${summarySources?.length
         ? `<details style="margin-top:14px"><summary class="read-more" style="cursor:pointer">Official sources used</summary><div class="small muted" style="display:grid;gap:6px;margin-top:10px">${summarySources.map(src=>`<a href="${esc(src.url)}" target="_blank" rel="noreferrer">${esc(src.title)}</a>`).join('')}</div></details>`
         : (bill.source_url?`<a class="read-more" href="${esc(bill.source_url)}" target="_blank" rel="noreferrer">Read full bill record</a>`:'')}
     </section>

     

     <section class="bill-section" id="cast-vote">
       <h2 class="bill-section-title">Cast your vote</h2>
       <div class="vote-choice-grid">
         <a class="vote-choice ${position==='YES'?'selected':''}" href="/vote/${encodeURIComponent(bill.instrument)}/YES" style="text-decoration:none">
           <span class="overline">${position==='YES'?'Your vote':'Your read'}</span>
           <strong>Vote Yes</strong>
           <span>Back the bill</span>
         </a>
         <a class="vote-choice no ${position==='NO'?'selected':''}" href="/vote/${encodeURIComponent(bill.instrument)}/NO" style="text-decoration:none">
           <span class="overline">${position==='NO'?'Your vote':'Your read'}</span>
           <strong>Vote No</strong>
           <span>Block the bill</span>
         </a>
       </div>
       <div class="community-box">
         <div class="community-head">
           <strong>Community</strong>
           <span class="muted">
             ${communityTotal>0?`<span id="community-percent">${esc(communityLeadLabel)}</span> · `:''}
             <span id="community-total">${esc(communityTotal)}</span> vote${communityTotal===1?'':'s'}
           </span>
         </div>
         <div class="community-bar"><div class="community-yes" id="community-bar" style="width:${esc(communityYesPercent)}%"></div></div>
         ${(signedIn?representativeComparisons:[]).map(comparison=>{
           const isSenate=comparison.chamber==='SENATE';
           if(position!=='YES'&&position!=='NO')return `
           <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
             <div class="overline" style="margin-bottom:5px">Your ${isSenate?'senator':'representative'}</div>
             <a href="#cast-vote" class="read-more" style="font-weight:800;font-size:1rem">Cast your vote to see how your ${isSenate?'senator':'representative'} voted.</a>
           </div>`;
           const name=`${isSenate?'Sen.':'Rep.'} ${lawmakerName(comparison,comparison.last_name||comparison.display_name)}`;
           return `
           <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
             <div class="overline" style="margin-bottom:5px">Your ${isSenate?'senator':'representative'}</div>
             ${comparison.matched!==null
               ? `
                 <div style="font-weight:800;font-size:1rem;line-height:1.35">
                   ${name} ${comparison.matched?'backed':'broke with'} your position.
                 </div>
                 <div class="muted" style="margin-top:3px">
                   ${comparison.matched?`You both voted ${esc(comparison.user_position)}.`:`You voted ${esc(comparison.user_position)}. ${name} voted ${esc(comparison.representative_position)}.`}
                 </div>
               `
               : `
                 <div style="font-weight:800;font-size:1rem">${name} voted ${esc(comparison.representative_position)}.</div>
                 <div class="muted" style="margin-top:3px">${esc(comparison.motion||'Floor vote')}</div>
               `}
           </div>
         `;}).join('')}
       </div>
       ${!signedIn?`<p class="small muted" style="margin-top:14px">Sign in to save your vote and compare it with Louisiana lawmakers.</p>`:''}
     </section>

     <section class="bill-section" id="floor-debate">
       <div class="debate-head"><h2 class="bill-section-title" style="margin:0">Floor debate</h2><strong class="muted">${esc(commentCount)} comment${commentCount===1?'':'s'}</strong></div>
       <div class="debate-tabs"><button class="debate-tab active" data-sort="top">Top</button><button class="debate-tab" data-sort="new">Newest</button></div>
       ${signedIn?`<div class="comment-form"><textarea id="comment-body" class="field" placeholder="What do you think about this bill?"></textarea><button id="post-comment">Post comment</button></div>`:`<div style="padding:8px 0 20px"><p class="muted">Sign in to vote, comment, and upvote the best takes.</p><a class="button" href="/login?next=${encodeURIComponent(`/bills/${bill.instrument}`)}">Sign in</a></div>`}
       <div id="comments-list">${commentsHtml||'<div class="empty">No comments yet. Start the floor debate.</div>'}</div>
     </section>

     <section class="bill-section">
       <h2 class="bill-section-title">Official votes</h2>
       <div class="stack">${(bill.vote_events??[]).map(v=>`<div class="vote-card"><div class="meta"><span class="chip ${String(v.chamber).toLowerCase()}">${esc(v.chamber)}</span><span class="chip">${esc(v.event_type)}</span></div><h3 style="margin-top:10px">${esc(v.motion||'Vote')}</h3><div class="small muted">${fmtDate(v.vote_date)}${v.yea_total!=null?` · ${esc(v.yea_total)} yea`:''}${v.nay_total!=null?` · ${esc(v.nay_total)} nay`:''}</div></div>`).join('')||'<div class="empty">No official votes recorded yet.</div>'}</div>
     </section>
   </main>
   <a class="sticky-vote" href="${signedIn?'#cast-vote':`/login?next=${encodeURIComponent(`/bills/${bill.instrument}`)}`}">${signedIn?'Cast your vote':'Sign in to vote'}</a>
<script>
const signedIn=${signedIn?'true':'false'};
const instrument=${JSON.stringify(bill.instrument)};

document.getElementById('share-bill')?.addEventListener('click',async()=>{
  try{
    if(navigator.share) await navigator.share({title:document.title,url:location.href});
    else { await navigator.clipboard.writeText(location.href); alert('Bill link copied.'); }
  }catch{}
});

document.getElementById('post-comment')?.addEventListener('click',async()=>{
  const body=document.getElementById('comment-body').value.trim();
  if(!body)return;
  const r=await fetch('/api/bills/'+encodeURIComponent(instrument)+'/comments',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})
  });
  const data=await r.json();
  if(!r.ok){alert(data.error||'Could not post comment.');return}
  location.reload();
});

document.addEventListener('click',async e=>{
  const like=e.target.closest('[data-like]');
  if(like){
    if(!signedIn){location.href='/login?next='+encodeURIComponent('/bills/'+instrument);return}
    const liked=like.classList.contains('liked');
    const r=await fetch('/api/comments/'+like.dataset.like+'/like',{method:liked?'DELETE':'POST'});
    if(r.ok) location.reload();
    return;
  }
  const reply=e.target.closest('[data-reply]');
  if(reply){
    const box=document.getElementById('reply-form-'+reply.dataset.reply);
    if(box)box.hidden=!box.hidden;
    return;
  }
  const submit=e.target.closest('[data-submit-reply]');
  if(submit){
    const id=submit.dataset.submitReply;
    const body=document.getElementById('reply-body-'+id)?.value.trim();
    if(!body)return;
    const r=await fetch('/api/bills/'+encodeURIComponent(instrument)+'/comments',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body,parent_comment_id:Number(id)})
    });
    const data=await r.json();
    if(!r.ok){alert(data.error||'Could not post reply.');return}
    location.reload();
  }
});
</script>`
 });
}

export function renderLegislators({legislators=[],signedIn=false,userName=null}){
 const cards=legislators.map(l=>`<a class="bill-card" href="/legislators/${l.id}"><div class="profile-head"><div class="avatar">${esc((l.first_name?.[0]||'')+(l.last_name?.[0]||''))}</div><div><h3>${lawmakerName(l)}</h3><div class="muted">${esc(l.chamber)} District ${esc(l.district_number)}</div></div></div></a>`).join('');
 return page({title:'Legislators',active:'legislators',signedIn,userName,body:`<main class="wrap"><section class="hero"><div class="eyebrow">Louisiana lawmakers</div><h1>Legislators</h1><p class="lede">Browse lawmakers, authored bills, and recorded votes.</p></section><section class="stack" style="margin-top:22px">${cards||'<div class="empty">No legislators found.</div>'}</section></main>`});
}

export function renderLegislator(profile,{signedIn=false,alignment=null,userName=null}={}){
 const bills=(profile.authored_bills??[]).map(b=>`<a class="bill-card" href="/bills/${encodeURIComponent(b.instrument)}"><div class="meta"><span class="chip">${esc(b.instrument)}</span><span class="chip status">${esc(statusLabel(b.normalized_status))}</span></div><h3 style="margin-top:10px">${esc(b.subject||'No subject')}</h3><div class="small muted">${esc(b.official_description||'')}</div></a>`).join('');
 const votes=(profile.recent_votes??[]).map(v=>`<a class="bill-card" href="/bills/${encodeURIComponent(v.instrument)}"><div class="meta"><span class="chip">${esc(v.instrument)}</span><span class="chip ${voteClass(v.vote)}">${esc(v.vote)}</span><span class="chip">${esc(v.event_type)}</span></div><div style="margin-top:10px"><strong>${esc(v.motion||'Vote')}</strong></div><div class="small muted">${fmtDate(v.vote_date)} · ${esc(v.subject||'')}</div></a>`).join('');
 const align=alignment?`<section class="panel"><div class="eyebrow">Your alignment</div><div class="align-score">${esc(alignment.percent)}%</div><div class="small muted">${esc(alignment.matches)} agreements · ${esc(alignment.disagreements)} disagreements · ${esc(alignment.comparable)} comparable bills</div></section>`:'';
 return page({title:profile.display_name,active:'legislators',signedIn,userName,body:`<main class="wrap"><section class="hero"><div class="profile-head"><div class="avatar">${esc((profile.first_name?.[0]||'')+(profile.last_name?.[0]||''))}</div><div><div class="eyebrow">${esc(profile.chamber)} District ${esc(profile.district_number)}</div><h1 style="margin-bottom:8px">${lawmakerName(profile)}</h1></div></div></section><div class="grid"><section class="panel"><h2>Recent votes</h2><div class="stack">${votes||'<div class="empty">No recorded votes.</div>'}</div></section><aside class="stack">${align}<section class="panel"><h2>Authored bills</h2><div class="stack">${bills||'<div class="empty">No authored bills recorded.</div>'}</div></section></aside></div></main>`});
}

export function renderLogin({providers,next='/account'}){
 const button=providers.google?`<a class="button google" href="/auth/google?next=${encodeURIComponent(next)}">Continue with Google</a>`:'<div class="empty">Google sign-in is not configured yet.</div>';
 return page({title:'Sign in',active:'account',body:`<main class="wrap"><section class="hero" style="max-width:620px;margin:auto"><div class="eyebrow">My LeLegis</div><h1>Sign in</h1><p class="lede">Save your Yes/No positions and compare them with Louisiana lawmakers. Your saved positions are private by default.</p><div class="auth-buttons">${button}</div></section></main>`});
}

export function renderAccount({user,positions=[],alignment=[],settings={},members=[],stats={}}){
 const pos=positions.map(p=>`<a class="bill-card" href="/bills/${encodeURIComponent(p.instrument)}"><div class="meta"><span class="chip">${esc(p.instrument)}</span><span class="chip ${voteClass(p.position)}">${esc(p.position)}</span></div><h3 style="margin-top:10px">${esc(p.subject||'')}</h3></a>`).join('');
 const membersHtml=members.map(m=>`<a class="member-card" href="/legislators/${m.legislator_id}"><div class="avatar" style="width:54px;height:54px;font-size:20px">${esc((m.first_name?.[0]||'')+(m.last_name?.[0]||''))}</div><div><div class="eyebrow">${esc(m.chamber)} District ${esc(m.district_number)}</div><h3 style="margin:4px 0">${lawmakerName(m)}</h3></div><div class="member-score">${m.alignment?.comparable?`${esc(m.alignment.percent)}%`:'—'}<small>alignment</small></div></a>`).join('');
 const allMatches=alignment.slice(0,10).map(a=>`<a class="align-row" href="/legislators/${a.legislator_id}" style="text-decoration:none"><div><strong>${lawmakerName(a)}</strong><div class="small muted">${esc(a.chamber)} District ${esc(a.district_number)} · ${esc(a.comparable)} comparable</div></div><div class="align-score">${esc(a.percent)}%</div></a>`).join('');
 const houseVal=settings.house_district??'';
 const senateVal=settings.senate_district??'';
 return page({title:'Account',active:'account',signedIn:true,userName:user.name,body:`<main class="wrap">
 <section class="hero"><div class="eyebrow">Your LeLegis</div><h1>${esc(user.name||'Your account')}</h1><p class="lede">Track your votes, see how your members compare, and manage your account.</p><button id="signout" class="button secondary">Sign out</button></section>

 <section class="panel account-section"><h2>Dashboard</h2><div class="statgrid">
   <div class="stat"><span>Bills voted on</span><strong>${esc(stats.billsVoted??0)}</strong></div>
   <div class="stat"><span>Comments</span><strong>${esc(stats.comments??0)}</strong></div>
   <div class="stat"><span>Sway</span><strong>${esc(stats.sway??0)}</strong></div>
   <div class="stat"><span>Rep. alignment</span><strong>${stats.representativeAlignment==null?'—':`${esc(stats.representativeAlignment)}%`}</strong></div>
 </div></section>

 <section class="panel account-section"><div class="meta" style="justify-content:space-between"><h2>Your Members</h2><a href="#settings" class="small">Edit districts</a></div>
   ${membersHtml?`<div class="member-grid">${membersHtml}</div>`:`<div class="empty">Set your Louisiana House and Senate districts in Settings below to show your members here.</div>`}
 </section>

 <div class="grid account-section">
   <section class="panel"><h2>Your positions</h2><div class="stack">${pos||'<div class="empty">You have not rated any bills yet.</div>'}</div></section>
   <aside class="panel"><h2>Best matches</h2>${allMatches||'<div class="empty">Rate bills with recorded floor votes to calculate alignment.</div>'}</aside>
 </div>

 <section class="panel account-section" id="settings"><h2>Settings</h2><div class="settings-grid">
   <div class="setting-block"><h3>Your legislative districts</h3><p class="small muted">Used only to identify your Louisiana House and Senate members. LeLegis does not need your street address.</p><p class="small"><a href="/onboarding/representatives">Find my districts by address, ZIP, or current location</a></p>
     <div class="form-row">
       <label class="field-label">House district<input class="field" id="house-district" type="number" min="1" max="105" value="${esc(houseVal)}" placeholder="1–105"></label>
       <label class="field-label">Senate district<input class="field" id="senate-district" type="number" min="1" max="39" value="${esc(senateVal)}" placeholder="1–39"></label>
       <button id="save-districts">Save</button>
     </div><div id="settings-status" class="small muted" style="margin-top:10px"></div>
   </div>
   <div class="setting-block danger-zone"><h3>Delete account</h3><p class="small muted">Permanently deletes your LeLegis account, saved bill positions, comments, likes, settings, and sessions.</p>
     <button id="delete-account" class="button danger">Delete account</button>
   </div>
 </div></section>
 </main>
 <script>
 document.getElementById('signout').addEventListener('click',async()=>{await fetch('/api/auth/sign-out',{method:'POST'});location.href='/'});
 document.getElementById('save-districts').addEventListener('click',async()=>{
   const r=await fetch('/api/me/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({house_district:document.getElementById('house-district').value,senate_district:document.getElementById('senate-district').value})});
   const data=await r.json();const status=document.getElementById('settings-status');
   if(!r.ok){status.textContent=data.error||'Could not save settings.';return}
   status.textContent='Saved. Reloading your members…';location.reload();
 });
 document.getElementById('delete-account').addEventListener('click',async()=>{
   const confirmation=prompt('This permanently deletes your LeLegis account and all of your data. Type DELETE to confirm.');
   if(confirmation!=='DELETE')return;
   const r=await fetch('/api/me/delete-account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:'DELETE'})});
   const data=await r.json();
   if(!r.ok){alert(data.error||'Could not delete account.');return}
   location.href='/';
 });
 </script>`});
}


export function renderRepresentativeOnboarding({user,settings={}}){
  return page({title:'Find your representatives',active:'account',signedIn:true,userName:user.name,body:`<main class="wrap">
    <section class="hero">
      <div class="eyebrow">Welcome to LeLegis</div>
      <h1>Find your representatives</h1>
      <p class="lede">Use your Louisiana address, ZIP code, or current location. LeLegis uses the Louisiana Legislature's enacted House and Senate district maps to determine your districts. Your address or coordinates are used for this lookup only and are not saved.</p>
    </section>

    <section class="panel account-section">
      <div class="lookup-tabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
        <button class="button secondary lookup-tab" data-mode="address">Address</button>
        <button class="button secondary lookup-tab" data-mode="zip">ZIP code</button>
        <button class="button secondary lookup-tab" data-mode="location">Current location</button>
      </div>

      <div id="lookup-address" class="lookup-pane">
        <label class="field-label">Louisiana street address
          <input id="address-input" class="field" placeholder="123 Main St, Baton Rouge, LA 70802">
        </label>
        <button id="address-find" style="margin-top:12px">Find my representatives</button>
      </div>

      <div id="lookup-zip" class="lookup-pane" hidden>
        <label class="field-label">Louisiana ZIP code
          <input id="zip-input" class="field" inputmode="numeric" maxlength="5" placeholder="70802">
        </label>
        <p class="small muted">ZIP lookup uses the ZIP's geographic center and may be approximate if the ZIP crosses district lines. Address or current location is more precise.</p>
        <button id="zip-find">Find by ZIP</button>
      </div>

      <div id="lookup-location" class="lookup-pane" hidden>
        <p class="muted">Your browser will ask permission to use your current location. LeLegis does not save the coordinates.</p>
        <button id="location-find">Use my current location</button>
      </div>

      <div id="lookup-status" class="small muted" style="margin-top:16px"></div>
      <div id="lookup-result" style="margin-top:18px"></div>
    </section>

    <section class="panel account-section">
      <h2>Already know your districts?</h2>
      <div class="form-row">
        <label class="field-label">House district<input id="manual-house" class="field" type="number" min="1" max="105" value="${esc(settings.house_district??'')}" placeholder="1–105"></label>
        <label class="field-label">Senate district<input id="manual-senate" class="field" type="number" min="1" max="39" value="${esc(settings.senate_district??'')}" placeholder="1–39"></label>
        <button id="manual-save">Save districts</button>
      </div>
    </section>
  </main>
<script>
let found=null;
const panes={address:document.getElementById('lookup-address'),zip:document.getElementById('lookup-zip'),location:document.getElementById('lookup-location')};
document.querySelectorAll('.lookup-tab').forEach(btn=>btn.addEventListener('click',()=>{Object.entries(panes).forEach(([k,p])=>p.hidden=k!==btn.dataset.mode)}));

async function lookup(body){
  const status=document.getElementById('lookup-status'), result=document.getElementById('lookup-result');
  status.textContent='Looking up your Louisiana legislative districts…'; result.innerHTML='';

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);

  let r,data;
  try{
    r=await fetch('/api/representatives/lookup',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body),
      signal:controller.signal
    });
    data=await r.json();
  }catch(err){
    status.textContent=err?.name==='AbortError'
      ? 'The address service took too long. Try again, use current location, or enter your districts manually.'
      : 'The address lookup could not be completed. Try again or use current location.';
    return;
  }finally{
    clearTimeout(timer);
  }

  if(!r.ok){status.textContent=data.error||'Lookup failed.';return}
  found=data.result; status.textContent='';
  const approx=found.approximate?'<div class="small muted" style="margin-bottom:10px">ZIP result is approximate. Confirm the districts below, or use address/current location for a precise lookup.</div>':'';
  result.innerHTML=approx+'<div class="member-grid">'+
    '<div class="member-card"><div><div class="eyebrow">Louisiana House</div><h3>District '+found.house.district_number+'</h3><div class="muted">'+(found.house.member?.display_name||'Current seat lookup unavailable')+'</div></div></div>'+
    '<div class="member-card"><div><div class="eyebrow">Louisiana Senate</div><h3>District '+found.senate.district_number+'</h3><div class="muted">'+(found.senate.member?.display_name||'Current seat lookup unavailable')+'</div></div></div>'+
  '</div><button id="save-found" style="margin-top:16px">Save these as my districts</button>';
  document.getElementById('save-found').addEventListener('click',()=>save(found.house.district_number,found.senate.district_number));
}

async function save(house,senate){
  const r=await fetch('/api/me/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({house_district:house,senate_district:senate})});
  const data=await r.json();
  if(!r.ok){document.getElementById('lookup-status').textContent=data.error||'Could not save districts.';return}
  location.href='/account';
}

document.getElementById('address-find').addEventListener('click',()=>lookup({mode:'address',address:document.getElementById('address-input').value}));
document.getElementById('zip-find').addEventListener('click',()=>lookup({mode:'zip',zip:document.getElementById('zip-input').value}));
document.getElementById('location-find').addEventListener('click',()=>{
  const status=document.getElementById('lookup-status');
  if(!navigator.geolocation){status.textContent='Current location is not available in this browser.';return}
  status.textContent='Waiting for location permission…';
  navigator.geolocation.getCurrentPosition(
    p=>lookup({mode:'location',lat:p.coords.latitude,lon:p.coords.longitude}),
    ()=>status.textContent='Location permission was denied or unavailable.',
    {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
  );
});
document.getElementById('manual-save').addEventListener('click',()=>save(document.getElementById('manual-house').value,document.getElementById('manual-senate').value));
</script>`});
}

export function renderNotFound(message='Not found',signedIn=false,userName=null){
 return page({title:'Not found',signedIn,userName,body:`<main class="wrap"><section class="hero"><div class="eyebrow">404</div><h1>Not found</h1><p class="lede">${esc(message)}</p><a class="button" href="/">Back to LeLegis</a></section></main>`});
}
