import test from 'node:test';
import assert from 'node:assert/strict';
import { getLegislativeAnalytics } from '../src/lib/legislative-analytics.js';
import { renderAnalyticsPreview, renderAnalyticsBody } from '../src/lib/analytics-ui.js';

function fakeDb(){
  const data = [
    [{id:1,session_code:'26RS',session_name:'2026 Regular Session',start_date:'2026-03-09'}],
    [
      {id:1,instrument:'HB1',subject:'APPROPRIATIONS',official_description:'Budget',normalized_status:'ENACTED',origin_chamber:'HOUSE',instrument_type:'HB'},
      {id:2,instrument:'SR204',subject:'COMMENDATIONS',official_description:'Commends a community leader',normalized_status:'ADOPTED',origin_chamber:'SENATE',instrument_type:'SR'},
      {id:3,instrument:'SR196',subject:'LEGIS POWERS/FUNCTIONS',official_description:'Creates a task force to study blight',normalized_status:'ADOPTED',origin_chamber:'SENATE',instrument_type:'SR'}
    ],
    [{bill_id:1,action_date:'2026-04-01'},{bill_id:2,action_date:'2026-04-02'},{bill_id:3,action_date:'2026-05-01'}],
    [{bill_id:1,legislator_id:5,display_name:'Rep. Test',chamber:'HOUSE'}]
  ];
  let call=0;
  return {prepare:()=>({bind(){return this},async all(){return {results:data[call++]}}})};
}

test('analytics uses stored rows, removes ceremonial commendations and counts primary authors',async()=>{
  const result=await getLegislativeAnalytics({DB:fakeDb()});
  assert.equal(result.total,2);
  assert.deepEqual(result.outcomes.map(r=>[r.label,r.count]),[['ADOPTED',1],['ENACTED',1]]);
  assert.equal(result.authors[0].count,1);
  assert.deepEqual(result.months.map(r=>r.count),[1,1]);
});

test('preview links are distinct and dashboard escapes source text',async()=>{
  const data=await getLegislativeAnalytics({DB:fakeDb()});
  const html=renderAnalyticsPreview(data);
  for(const section of ['subjects','outcomes','activity']) assert.match(html,new RegExp('/analytics#'+section));
  const full=renderAnalyticsBody({...data,subjects:[{label:'<script>alert(1)</script>',count:2}]});
  assert.ok(!full.includes('<script>'));
  assert.match(full,/Primary authors/);
});
