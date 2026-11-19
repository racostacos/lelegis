import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {billBackQuery,trackerBackPath,resetSignInPath} from '../src/lib/tracker-navigation.js';
import {renderBills,renderBill} from '../src/ui.js';

const back='/?q=school+funding&repVote=voted&myVote=not-voted&chamber=senate';
const bill={instrument:'SR7',subject:'Education',origin_chamber:'SENATE'};
const decode=s=>s.replaceAll('&amp;','&');

test('opening a bill, voting YES or NO, and returning retains all three filters and search',()=>{
  const tracker=renderBills({bills:[bill],signedIn:true,representativeAvailable:true,query:'school funding',repVote:'voted',myVote:'not-voted',chamber:'senate'});
  const card=decode(tracker.match(/class="bill-card" href="([^"]+)"/)[1]);
  assert.equal(new URL(card,'https://example.test').searchParams.get('back'),back);
  const page=renderBill(bill,{signedIn:true,backPath:back});
  assert.equal(decode(page.match(/class="bill-back" href="([^"]+)"/)[1]),back);
  for(const position of ['YES','NO']){
    const link=decode(page.match(new RegExp(`href="(/vote/SR7/${position}[^\"]*)"`))[1]);
    assert.equal(new URL(link,'https://example.test').searchParams.get('back'),back);
    assert.equal(billBackQuery(new URL(link,'https://example.test').searchParams.get('back')),billBackQuery(back));
  }
});

test('refresh resets filters but browser Back and ordinary navigation do not',()=>{
  const html=renderBills({signedIn:true,repVote:'voted',myVote:'not-voted',chamber:'senate'});
  const script=html.match(/<script>\s*(\/\/ History navigation[^]*?)<\/script>/)[1];
  for(const type of ['navigate','back_forward','reload']){
    const redirects=[];
    runInNewContext(script,{URL,performance:{getEntriesByType:()=>[{type}]},location:{href:`https://example.test${back}`,replace:value=>redirects.push(value)}});
    assert.deepEqual(redirects,type==='reload'?['/?q=school+funding']:[]);
  }
  const redirects=[];
  runInNewContext(script,{URL,performance:{getEntriesByType:()=>[{type:'reload'}]},location:{href:'https://example.test/?q=school',replace:value=>redirects.push(value)}});
  assert.deepEqual(redirects,[]);
});

test('new OAuth sign-in strips filters and bill-return context without changing destination',()=>{
  assert.equal(resetSignInPath(back),'/?q=school+funding');
  assert.equal(resetSignInPath('/bills?chamber=house'),'/bills');
  assert.equal(resetSignInPath(`/bills/SR7${billBackQuery(back)}#cast-vote`),'/bills/SR7#cast-vote');
  assert.equal(resetSignInPath('/account'),'/account');
});

test('direct links remain unfiltered and return paths cannot point outside the tracker',()=>{
  assert.equal(trackerBackPath('//evil.example'),'/' );
  assert.equal(trackerBackPath('/account?chamber=house'),'/' );
  assert.equal(trackerBackPath('/?myVote=invalid&redirect=https://evil.example'),'/' );
  assert.equal(billBackQuery('/'),'');
  assert.match(renderBill(bill),/class="bill-back" href="\/"/);
});
