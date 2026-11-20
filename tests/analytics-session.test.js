import test from 'node:test';
import assert from 'node:assert/strict';
import { getLegislativeAnalytics } from '../src/lib/legislative-analytics.js';

function fakeDb(){
  const log=[];
  return {log, prepare(sql){
    let args=[];
    return {bind(...values){args=values;return this}, async all(){
      log.push({sql,args});
      if(sql.includes('FROM sessions s ORDER BY')) return {results:[
        {id:2,session_code:'26ES',session_name:'2026 Extra Session',start_date:'2026-10-01',indexed_bills:0},
        {id:1,session_code:'26RS',session_name:'2026 Regular Session',start_date:'2026-03-09',indexed_bills:2}
      ]};
      if(sql.includes('FROM bills\n')) return {results:args[0]===1?[
        {id:1,instrument:'HB1',subject:'APPROPRIATIONS',official_description:'Budget',normalized_status:'ENACTED',origin_chamber:'HOUSE',instrument_type:'HB'},
        {id:3,instrument:'SR196',subject:'TASK FORCES',official_description:'Creates task force',normalized_status:'ADOPTED',origin_chamber:'SENATE',instrument_type:'SR'}
      ]:[]};
      if(sql.includes('FROM bill_actions')) return {results:args[0]===1?[{bill_id:1,action_date:'2026-04-01'}]:[]};
      return {results:[]};
    }};
  }};
}

test('defaults to most recent session containing indexed bills', async()=>{
  const db=fakeDb();
  const data=await getLegislativeAnalytics({DB:db},{},{preview:true});
  assert.equal(data.filters.session,'26RS');
  assert.equal(data.total,2);
  assert.equal(data.subjects.length,2);
  assert.equal(data.outcomes.length,2);
  assert.equal(data.months.length,1);
});

test('respects an explicitly selected empty session',async()=>{
  const db=fakeDb();
  const data=await getLegislativeAnalytics({DB:db},{session:'26ES'},{preview:true});
  assert.equal(data.filters.session,'26ES');
  assert.equal(data.total,0);
});
