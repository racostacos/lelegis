import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareBillMembers} from '../src/lib/bill-member-comparison.js';
import {renderBill} from '../src/ui.js';

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
