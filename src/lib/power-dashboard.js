// LeLegis: current state-government composition and verified 2026 leadership.
// This is intentionally separate from session-scoped bill analytics.
const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const party = v => {
  const p=String(v??'').trim().toUpperCase();
  if(['R','REP','REPUBLICAN'].includes(p))return 'Republican';
  if(['D','DEM','DEMOCRAT','DEMOCRATIC'].includes(p))return 'Democratic';
  if(['I','IND','INDEPENDENT'].includes(p))return 'Independent';
  return 'Other / unrecorded';
};
const LEADERS = [
  {title:'Governor',name:'Jeff Landry',party:'R',photo:'https://www.nga.org/wp-content/uploads/2024/01/Governor-Landry-Official-Portrait_square-scaled.jpg',url:'https://www.gov.louisiana.gov/page/meet-the-governor'},
  {title:'Senate President',name:'Cameron Henry',party:'R',photo:'https://senate.la.gov/Senators2428/Sen9.jpg',url:'https://senate.la.gov/Officers'},
  {title:'Senate President Pro Tempore',name:'Regina Barrow',party:'D',photo:'https://senate.la.gov/Senators2428/Sen15.jpg',url:'https://senate.la.gov/Officers'},
  {title:'Senate Democratic Caucus Chair',name:'Gerald Boudreaux',party:'D',photo:'https://senate.la.gov/SenPicsLarge/Sen24.jpg',url:'https://louisianadems.org/party-leaders/'},
  {title:'House Speaker',name:'Phillip DeVillier',party:'R',photo:'https://www.house.louisiana.gov/H_Reps/RepPics24New_OLD/rep41.jpg',url:'https://www.house.louisiana.gov/H_Staff/H_Staff_HouseOfficers'},
  {title:'House Speaker Pro Tempore',name:'Michael T. Johnson',party:'R',photo:'https://www.house.louisiana.gov/H_Reps/RepPics24New_OLD/rep27.jpg',url:'https://www.house.louisiana.gov/H_Staff/H_Staff_HouseOfficers'},
  {title:'House Democratic Caucus Chair',name:'Kyle Green Jr.',party:'D',photo:'https://house.louisiana.gov/H_Reps/RepPicsLarge/rep83.jpg',url:'https://louisianadems.org/party-leaders/'}
];

export async function getPowerComposition(env){
  const rows=(await env.DB.prepare(`SELECT chamber,district_number,party FROM legislators WHERE is_active=1 AND chamber IN ('HOUSE','SENATE')`).all()).results??[];
  const byChamber={};
  for(const [chamber,seats] of [['HOUSE',105],['SENATE',39]]){
    // Count seats once even when the historical legislator table has duplicate records.
    const distinct=new Map();
    for(const row of rows){
      if(row.chamber!==chamber)continue;
      const seat=Number(row.district_number);
      if(!Number.isInteger(seat)||seat<1||seat>seats)continue;
      if(!distinct.has(seat))distinct.set(seat,party(row.party));
      else if(distinct.get(seat)!==party(row.party))distinct.set(seat,'Other / unrecorded');
    }
    const counts={Republican:0,Democratic:0,Independent:0,'Other / unrecorded':0,'No current member in database':seats-distinct.size};
    for(const affiliation of distinct.values())counts[affiliation]++;
    byChamber[chamber]={seats,counts};
  }
  const gop=byChamber.HOUSE.counts.Republican>105/2&&byChamber.SENATE.counts.Republican>39/2;
  const dem=byChamber.HOUSE.counts.Democratic>105/2&&byChamber.SENATE.counts.Democratic>39/2;
  return {chambers:byChamber,headline:gop?'Republicans are in power.':dem?'Democrats hold both legislative chambers.':'Legislative control is divided or unverified.',leaders:LEADERS};
}

export function renderPowerSection(power){
  if(!power)return '<section class="panel"><h2>Who’s in power?</h2><p class="muted">Current legislative composition is unavailable.</p></section>';
  const colors={'Republican':'#aa3329','Democratic':'#467dbd','Independent':'#9a789d','Other / unrecorded':'#b5b8b8','No current member in database':'#e1e4e4'};
  const chart=(chamber,title)=>{
    const {seats,counts}=power.chambers[chamber];
    // Keep missing database seats unassigned in the bar, not labeled as independents.
    const segments=Object.entries(counts).filter(([name,n])=>n>0&&name!=='No current member in database');
    const bar=segments.map(([label,n])=>`<span title="${esc(label)}: ${n}" style="width:${100*n/seats}%;height:100%;background:${colors[label]}"></span>`).join('');
    const labels=['Republican','Democratic','Independent'].map(name=>[name,counts[name]??0])
      .concat(segments.filter(([name])=>!['Republican','Democratic','Independent'].includes(name)));
    return `<div style="min-width:0;flex:1 1 280px"><strong>${title}</strong><div role="img" aria-label="${esc(title)} composition: ${esc(labels.map(([name,n])=>name+' '+n).join(', '))}" style="display:flex;height:20px;overflow:hidden;border-radius:6px;background:#e1e4e4;margin:9px 0">${bar}</div><div style="font-size:12px;line-height:1.8;color:#607080">${labels.map(([name,n])=>`<span style="white-space:nowrap;margin-right:12px"><span aria-hidden="true" style="display:inline-block;width:8px;height:8px;background:${colors[name]};border-radius:50%;margin-right:4px"></span>${esc(name)} ${n}</span>`).join('')}</div><div class="small muted">${seats} seats total</div></div>`;
  };
  const leaderCard=l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;min-width:0;border:1px solid #d9dfe0;border-radius:13px;overflow:hidden;background:#fff"><img src="${esc(l.photo)}" alt="Portrait of ${esc(l.name)}" loading="lazy" style="display:block;width:100%;height:110px;object-fit:cover;object-position:center 25%"><div style="padding:10px"><div style="font-size:11px;color:#607080;min-height:29px">${esc(l.title)}</div><strong style="font-size:13px;line-height:1.3;display:block">${esc(l.name)} (${l.party})</strong></div></a>`;
  return `<section id="power" class="panel" style="margin-top:22px">
    <div class="eyebrow">State government • current composition</div>
    <h2 style="margin:8px 0 10px">${esc(power.headline)}</h2>
    <p class="small muted">Louisiana state legislature, not the U.S. Congress. Seat counts come from active LeLegis legislator records.</p>
    <div style="display:flex;gap:22px;flex-wrap:wrap;margin:20px 0">${chart('HOUSE','Louisiana House')}${chart('SENATE','Louisiana Senate')}</div>
    <h3 style="margin:20px 0 12px">Leadership</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px">${power.leaders.map(leaderCard).join('')}</div>
  </section>`;
}
