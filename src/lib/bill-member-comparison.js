export function comparisonPriority(motion='',instrument=''){
  const m=String(motion).trim().toUpperCase();
  if(m.includes('VETO')&&m.includes('OVERRIDE'))return 40;
  if(m.includes('CONCUR')||m.includes('CONFERENCE'))return 30;
  if(m.includes('FINAL PASSAGE'))return 20;
  if(/^(?:HR|SR|HCR|SCR)\d+$/i.test(instrument)&&m==='ADOPT')return 20;
  return 0;
}

export function compareBillMembers(bill,members,userPosition){
  return members.flatMap(member=>{
    const results=(bill.vote_events??[]).flatMap(event=>{
      if(event.chamber!==member.chamber||event.event_type!=='FLOOR')return [];
      const vote=event.member_votes?.find(row=>row.legislator_id===member.legislator_id&&['YEA','NAY'].includes(row.vote));
      return vote?[{...event,vote:vote.vote,priority:comparisonPriority(event.motion,bill.instrument),dateKey:`${event.vote_date??''}T${event.vote_time??''}`}]:[];
    });
    results.sort((a,b)=>b.priority-a.priority||b.dateKey.localeCompare(a.dateKey)||Number(b.id)-Number(a.id));
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
