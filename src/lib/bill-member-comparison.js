export function comparisonPriority(motion='',instrument=''){
  const m=String(motion).trim().toUpperCase();
  if(m.includes('VETO')&&m.includes('OVERRIDE'))return 40;
  if(m.includes('CONCUR')||m.includes('CONFERENCE'))return 30;
  if(m.includes('FINAL PASSAGE'))return 20;
  if(/^(?:HR|SR|HCR|SCR)\d+$/i.test(instrument)&&['ADOPT','FINAL CONSIDERATION'].includes(m))return 20;
  return 0;
}

function voteTimeSeconds(value){
  const match=String(value??'').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if(!match)return -1;
  let hour=Number(match[1]);
  if(match[4])hour=hour%12+(match[4].toUpperCase()==='PM'?12:0);
  return hour*3600+Number(match[2])*60+Number(match[3]??0);
}

// Keep bill detail and alignment on the same motion/date/time/id ordering.
function compareRank(a,b){
  return b.priority-a.priority||String(b.vote_date??'').localeCompare(String(a.vote_date??''))||voteTimeSeconds(b.vote_time)-voteTimeSeconds(a.vote_time)||Number(b.vote_event_id??b.id)-Number(a.vote_event_id??a.id);
}

export function calculateMemberAlignment(rows){
  const chosen=new Map();
  for(const row of rows){
    if(!['YES','NO'].includes(row.user_position)||!['YEA','NAY'].includes(row.vote))continue;
    const priority=comparisonPriority(row.motion,row.instrument);
    if(!priority)continue;
    const candidate={...row,priority};
    const key=`${row.bill_id}:${row.legislator_id}`;
    const current=chosen.get(key);
    if(!current||compareRank(candidate,current)<0)chosen.set(key,candidate);
  }
  const scores=new Map();
  for(const row of chosen.values()){
    if(!scores.has(row.legislator_id))scores.set(row.legislator_id,{legislator_id:row.legislator_id,display_name:row.display_name,party:row.party,chamber:row.chamber,district_number:row.district_number,matches:0,disagreements:0,comparable:0});
    const score=scores.get(row.legislator_id);
    const match=row.user_position===(row.vote==='YEA'?'YES':'NO');
    score.comparable++;
    if(match)score.matches++;else score.disagreements++;
  }
  return [...scores.values()].map(score=>({...score,percent:Math.round(100*score.matches/score.comparable)})).sort((a,b)=>b.percent-a.percent||b.comparable-a.comparable||a.display_name.localeCompare(b.display_name));
}

export function compareBillMembers(bill,members,userPosition){
  return members.flatMap(member=>{
    const results=(bill.vote_events??[]).flatMap(event=>{
      if(event.chamber!==member.chamber||event.event_type!=='FLOOR')return [];
      const vote=event.member_votes?.find(row=>row.legislator_id===member.legislator_id&&['YEA','NAY'].includes(row.vote));
      return vote?[{...event,vote:vote.vote,priority:comparisonPriority(event.motion,bill.instrument)}]:[];
    });
    results.sort(compareRank);
    const chosen=results[0];
    if(!chosen)return [];
    // Before a saved YES/NO, expose availability only, never the actual vote.
    if(userPosition!=='YES'&&userPosition!=='NO')return [{chamber:member.chamber}];
    const memberPosition=chosen.vote==='YEA'?'YES':'NO';
    return [{
      legislator_id:member.legislator_id,
      chamber:member.chamber,
      display_name:member.display_name,
      last_name:member.last_name,
      district_number:member.district_number,
      party:member.party,
      user_position:userPosition??null,
      representative_position:memberPosition,
      matched:userPosition&&chosen.priority>0?userPosition===memberPosition:null,
      motion:chosen.motion,
      vote_date:chosen.vote_date
    }];
  });
}
