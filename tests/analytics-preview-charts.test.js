import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalyticsPreview } from '../src/lib/analytics-ui.js';

const example = {
  subjects:[{label:'EDUCATION',count:10},{label:'TAXATION',count:6},{label:'HOUSING',count:2}],
  outcomes:[{label:'ENACTED',count:6},{label:'REJECTED',count:3},{label:'ADOPTED',count:1}],
  months:[{label:'2026-05',count:30},{label:'2026-03',count:3},{label:'2026-04',count:12}]
};

test('homepage cards link to their corresponding analytics sections with distinct charts',()=>{
  const html=renderAnalyticsPreview(example);
  for(const id of ['subjects','outcomes','activity'])assert.match(html,new RegExp(`/analytics#${id}`));
  assert.match(html,/Top subjects:/);
  assert.match(html,/Recorded outcomes:/);
  assert.match(html,/Recorded legislative actions by month:/);
  assert.match(html,/<circle/);
  assert.match(html,/<polyline/);
  assert.match(html,/stroke-dasharray=/);
  assert.match(html,/>10<\/text>/);
});

test('chart values come from data, not hardcoded examples',()=>{
  const html=renderAnalyticsPreview({subjects:[{label:'UNIQUE_TOPIC',count:17}],outcomes:[{label:'ONLY_STATUS',count:4}],months:[{label:'2031-01',count:2}]});
  assert.match(html,/UNIQUE_TOPIC: 17/);
  assert.match(html,/ONLY_STATUS: 4/);
  assert.match(html,/2031-01: 2/);
  assert.match(html,/>4<\/text>/);
});

test('labels are escaped and empty data has a useful fallback',()=>{
  const html=renderAnalyticsPreview({subjects:[{label:'<script>',count:1}],outcomes:[],months:[]});
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.equal((html.match(/No data/g)||[]).length,2);
});
