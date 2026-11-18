import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrimaryAuthor,parseActionHistory,parseVoteLinks,deriveVoteEvents} from '../src/lib/bill-detail-parser.js';

test('author fallback',()=>{assert.equal(parsePrimaryAuthor('<div>Authors</div><span>Jack McFarland (primary)</span>','HB1'),'Jack McFarland');});

test('flattened actions',()=>{
 const html='<div>6/18/2026</div><div>H</div><div>27</div><div>Signed by the Governor with one or more line-item vetoes. Becomes Act No. 3.</div><div>4/16/2026</div><div>H</div><div>19</div><div>Read third time by title, roll called on final passage, yeas 104, nays 0. Finally passed.</div>';
 const a=parseActionHistory(html); assert.equal(a.length,2); assert.equal(a[1].action_date,'2026-04-16');
});

test('three floor links',()=>{
 const html='<a href="/ViewDocument.aspx?d=1">House Vote on HB 1 FINAL PASSAGE (#564)</a><a href="/ViewDocument.aspx?d=2">Senate Vote on HB 1 FINAL PASSAGE (#1381)</a><a href="/ViewDocument.aspx?d=3">House Vote on HB 1 CONCUR IN SENATE AMENDMENTS (#1765)</a>';
 const l=parseVoteLinks(html); assert.deepEqual(l.map(x=>x.sequence_number),[564,1381,1765]);
});

test('distinct floor events',()=>{
 const a=[
 {action_date:'2026-04-16',chamber:'HOUSE',official_text:'yeas 104, nays 0. Finally passed.'},
 {action_date:'2026-05-26',chamber:'SENATE',official_text:'passed by a vote of 38 yeas and 0 nays.'},
 {action_date:'2026-05-29',chamber:'HOUSE',official_text:'yeas 101, nays 0, Senate amendments concurred in.'}
 ];
 const l=[
 {source_url:'x1',sequence_number:564,chamber:'HOUSE',committee_short_name:null,vote_date:null,motion:'FINAL PASSAGE'},
 {source_url:'x2',sequence_number:1381,chamber:'SENATE',committee_short_name:null,vote_date:null,motion:'FINAL PASSAGE'},
 {source_url:'x3',sequence_number:1765,chamber:'HOUSE',committee_short_name:null,vote_date:null,motion:'CONCUR IN SENATE AMENDMENTS'}
 ];
 const e=deriveVoteEvents(a,l).filter(x=>x.event_type==='FLOOR'); assert.equal(e.length,3); assert.deepEqual(e.map(x=>x.sequence_number),[564,1381,1765]);
});
