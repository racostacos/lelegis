import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareBillMembers,calculateMemberAlignment} from '../src/lib/bill-member-comparison.js';
import {renderBill,renderLegislator} from '../src/ui.js';

const house={legislator_id:1,chamber:'HOUSE',last_name:'Example',party:'Republican'};
const senate={legislator_id:2,chamber:'SENATE',last_name:'Sample',party:'Democrat'};
const event=(id,chamber,member,vote,motion='FINAL PASSAGE',event_type='FLOOR')=>({id,chamber,motion,event_type,vote_date:'2026-05-01',member_votes:[{legislator_id:member.legislator_id,vote}]});
const bill={instrument:'HB1',vote_events:[event(1,'HOUSE',house,'NAY'),event(2,'SENATE',senate,'YEA'),event(3,'HOUSE',house,'YEA','CONCUR IN SENATE AMENDMENTS')]};

test('compares elected members independently and preserves motion priority',()=>{
  assert.deepEqual(compareBillMembers(bill,[house,senate],'NO').map(c=>[c.chamber,c.representative_position,c.matched]),[['HOUSE','YES',false],['SENATE','YES',false]]);
  assert.equal(compareBillMembers(bill,[senate],'YES')[0].matched,true);
});

test('procedural, absent and committee votes never imply bill agreement',()=>{
  const procedural={...bill,vote_events:[event(1,'HOUSE',house,'YEA','ADOPT AMENDMENT'),event(2,'SENATE',senate,'ABSENT'),event(3,'SENATE',senate,'YEA','FINAL PASSAGE','COMMITTEE')]};
  const comparisons=compareBillMembers(procedural,[house,senate],'YES');
  assert.equal(comparisons.length,1);
  assert.equal(comparisons[0].matched,null);
  assert.equal(comparisons[0].motion,'ADOPT AMENDMENT');
});

test('bill detail renders both comparison messages within a single community box',()=>{
  const mixed={...bill,vote_events:[event(1,'HOUSE',house,'YEA'),event(2,'SENATE',senate,'NAY')]};
  const html=renderBill(mixed,{signedIn:true,position:'YES',representativeComparisons:compareBillMembers(mixed,[house,senate],'YES')});
  assert.match(html,/Rep\. Example \(R\) backed your position/);
  assert.match(html,/You both voted YES/);
  assert.match(html,/Sen\. Sample \(D\) broke with your position/);
  assert.match(html,/Sen\. Sample \(D\) voted NO/);
  assert.equal((html.match(/class="community-box"/g)||[]).length,1);
});

test('without a saved vote exposes only availability for both chambers',()=>{
  const comparisons=compareBillMembers(bill,[house,senate],null);
  assert.deepEqual(comparisons,[{chamber:'HOUSE'},{chamber:'SENATE'}]);
  const html=renderBill(bill,{signedIn:true,representativeComparisons:comparisons});
  assert.match(html,/Cast your vote to see how your representative voted/);
  assert.match(html,/Cast your vote to see how your senator voted/);
  assert.doesNotMatch(html,/Rep\. Example|Sen\. Sample|backed your position|broke with your position/);
});

test('renderer independently hides member votes before voting, even if supplied',()=>{
  const comparisons=compareBillMembers(bill,[house,senate],'YES');
  for(const position of [null,'','INVALID']){
    const html=renderBill(bill,{signedIn:true,position,representativeComparisons:comparisons});
    assert.doesNotMatch(html,/Rep\. Example|Sen\. Sample|backed your position|broke with your position/);
  }
  const html=renderBill(bill,{signedIn:false,position:'YES',representativeComparisons:comparisons});
  assert.doesNotMatch(html,/Rep\. Example|Sen\. Sample|backed your position|broke with your position/);
});

test('saved NO reveals both actual member positions only after voting',()=>{
  const html=renderBill(bill,{signedIn:true,position:'NO',representativeComparisons:compareBillMembers(bill,[house,senate],'NO')});
  assert.match(html,/Rep\. Example \(R\) broke with your position/);
  assert.match(html,/Sen\. Sample \(D\) broke with your position/);
  assert.doesNotMatch(html,/Cast your vote to see how your/);
});

test('procedural vote is also concealed before the user votes',()=>{
  const procedural={...bill,vote_events:[event(1,'SENATE',senate,'YEA','ADOPT AMENDMENT')]};
  assert.deepEqual(compareBillMembers(procedural,[senate],null),[{chamber:'SENATE'}]);
  const html=renderBill(procedural,{signedIn:true,representativeComparisons:compareBillMembers(procedural,[senate],null)});
  assert.doesNotMatch(html,/Sen\. Sample|voted YES/);
});

test('resolution adoption outranks co-author votes in both chambers',()=>{
  for(const [instrument,member] of [['SR204',senate],['HR1',house],['SCR1',senate],['HCR1',house]]){
    const resolution={instrument,vote_events:[event(1,member.chamber,member,'YEA','ADOPT'),event(2,member.chamber,member,'NAY','CO-AUTHORS')]};
    const [comparison]=compareBillMembers(resolution,[member],'NO');
    assert.equal(comparison.motion,'ADOPT');
    assert.equal(comparison.representative_position,'YES');
    assert.equal(comparison.matched,false);
    assert.equal(compareBillMembers(resolution,[member],'YES')[0].matched,true);
  }
});

test('adoption of amendments and bill procedural adoption are not resolution passage',()=>{
  for(const [instrument,motion] of [['SR204','ADOPT AMENDMENT'],['HB1','ADOPT'],['SR204','CO-AUTHORS']]){
    const [comparison]=compareBillMembers({instrument,vote_events:[event(1,'HOUSE',house,'YEA',motion)]},[house],'YES');
    assert.equal(comparison.matched,null);
  }
});

const alignmentRows=(bill,member,user_position)=>bill.vote_events.filter(v=>v.event_type==='FLOOR'&&v.chamber===member.chamber).flatMap(v=>v.member_votes.filter(m=>m.legislator_id===member.legislator_id).map(m=>({...member,bill_id:bill.instrument,instrument:bill.instrument,user_position,vote:m.vote,vote_event_id:v.id,motion:v.motion,vote_date:v.vote_date,vote_time:v.vote_time})));

test('House FINAL CONSIDERATION votes count as substantive resolution votes in both views',()=>{
  const mack={legislator_id:93,id:93,chamber:'HOUSE',district_number:95,display_name:'Shane Mack',last_name:'Mack',party:'Republican'};
  // Verified public records: HR386 (NAY), SCR84 (YEA on final consideration).
  const rejected={instrument:'HR386',vote_events:[event(1,'HOUSE',mack,'NAY','FINAL CONSIDERATION')]};
  const adopted={instrument:'SCR84',vote_events:[event(2,'HOUSE',mack,'YEA','AMENDMENT # 6301 BY BAMBURG MOTION TO ADOPT'),event(3,'HOUSE',mack,'YEA','FINAL CONSIDERATION')]};
  for(const [bill,position] of [[rejected,'YES'],[adopted,'NO']])assert.equal(compareBillMembers(bill,[mack],position)[0].matched,false);
  const [score]=calculateMemberAlignment([...alignmentRows(rejected,mack,'YES'),...alignmentRows(adopted,mack,'NO')]);
  assert.deepEqual([score.matches,score.disagreements,score.comparable,score.percent],[0,2,2,0]);
  assert.match(renderLegislator(mack,{signedIn:true,alignment:score}),/0 agreements · 2 disagreements · 2 comparable bills/);
});

test('alignment and bill detail select the same latest substantive roll call and count a bill only once',()=>{
  const member={...house,display_name:'Example'};
  const record={instrument:'HB1',vote_events:[
    {...event(1,'HOUSE',member,'YEA'),vote_time:'9:30:00 AM'},
    {...event(2,'HOUSE',member,'NAY'),vote_time:'1:00:00 PM'},
    {...event(3,'HOUSE',member,'YEA'),vote_time:null},
    {...event(4,'HOUSE',member,'YEA','ADOPT AMENDMENT'),vote_time:'4:00:00 PM'}
  ]};
  for(const position of ['YES','NO']){
    const [comparison]=compareBillMembers(record,[member],position);
    const [score]=calculateMemberAlignment(alignmentRows(record,member,position));
    assert.equal(comparison.representative_position,'NO');
    assert.equal(score.comparable,1);
    assert.equal(score.matches,Number(comparison.matched));
    assert.equal(score.disagreements,Number(!comparison.matched));
  }
});

test('alignment excludes noncomparable, absent and invalid saved positions',()=>{
  const member={...house,display_name:'Example'};
  const record={instrument:'HR1',vote_events:[event(1,'HOUSE',member,'YEA','CO-AUTHORS'),event(2,'HOUSE',member,'ABSENT','FINAL CONSIDERATION')]};
  assert.deepEqual(calculateMemberAlignment(alignmentRows(record,member,'YES')),[]);
  assert.deepEqual(calculateMemberAlignment(alignmentRows(bill,member,null)),[]);
});
