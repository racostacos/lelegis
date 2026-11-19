import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterTrackerBills} from '../src/lib/tracker-filters.js';
import {renderBills} from '../src/ui.js';

const bill=(instrument,user_voted,representative_voted)=>({instrument,user_voted,representative_voted,user_position:user_voted?'YES':null,origin_chamber:'HOUSE',subject:'Education'});
const bills=[bill('HB1',true,true),bill('HB2',true,false),bill('HB3',false,true),bill('HB4',false,false)];
const states=['all','voted','not-voted'];
const expected=[
  [['HB1','HB2','HB3','HB4'],['HB1','HB3'],['HB2','HB4']],
  [['HB1','HB2'],['HB1'],['HB2']],
  [['HB3','HB4'],['HB3'],['HB4']]
];

test('every combination of user and representative filters intersects correctly',()=>{
  for(const [i,myVote] of states.entries())for(const [j,repVote] of states.entries()){
    const filtered=filterTrackerBills(bills,myVote,repVote);
    assert.deepEqual(filtered.map(b=>b.instrument),expected[i][j]);
    const html=renderBills({bills:filtered,signedIn:true,representativeAvailable:true,myVote,repVote});
    for(const b of bills)assert.equal(html.includes(`href="/bills/${b.instrument}"`),expected[i][j].includes(b.instrument),`${myVote}/${repVote}/${b.instrument}`);
    assert.equal(html.includes('>Needs your vote</h2>'),myVote!=='voted');
    assert.equal(html.includes('>Voted pile</h2>'),myVote!=='not-voted');
  }
});

test('changing either filter retains search and the other filter',()=>{
  const html=renderBills({bills:[],signedIn:true,representativeAvailable:true,query:'school funding',myVote:'voted',repVote:'not-voted'});
  const links=[...html.matchAll(/href="(\/\?[^\"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),'https://example.test').searchParams);
  for(const [rep,my] of [['all','voted'],['voted','voted'],['not-voted','voted'],['not-voted','all'],['not-voted','not-voted']]){
    assert.ok(links.some(p=>p.get('q')==='school funding'&&(p.get('repVote')??'all')===rep&&(p.get('myVote')??'all')===my),`${rep}/${my}`);
  }
  assert.match(html,/name="repVote" value="not-voted"/);
  assert.match(html,/name="myVote" value="voted"/);
  assert.ok(html.indexOf('>Representative</span>')<html.indexOf('>Your vote</span>'));
});

test('Voted view displays all saved positions, not just first 150 unvoted cards',()=>{
  const records=Array.from({length:170},(_,i)=>bill(`HB${i+1}`,true,false));
  const html=renderBills({bills:filterTrackerBills(records,'voted'),signedIn:true,myVote:'voted'});
  assert.equal((html.match(/class="bill-card"/g)||[]).length,170);
  assert.match(html,/170 voted/);
  assert.doesNotMatch(html,/Needs your vote<\/h2>/);
});

test('user filter works without assigned lawmakers and remains absent for signed-out users',()=>{
  const memberless=renderBills({bills:[],signedIn:true,representativeAvailable:false});
  assert.match(memberless,/>Your vote<\/span>/);
  assert.doesNotMatch(memberless,/>Representative<\/span>/);
  const anonymous=renderBills({bills:[],signedIn:false});
  assert.doesNotMatch(anonymous,/>Your vote<\/span>|>Representative<\/span>/);
});
