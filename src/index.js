import { refreshBillDetailsForRequest } from './lib/bill-detail-sync.js';
import { refreshBillForRequest, syncActiveSessions } from './lib/bill-sync.js';
import { createAuth, getSession, beginSocialSignIn, authProviders } from './auth.js';
import {
  renderHome, renderBills, renderBill, renderLegislators, renderLegislator,
  renderLogin, renderAccount, renderNotFound
} from './ui.js';

const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'}});
const html=(content,status=200)=>new Response(content,{status,headers:{'content-type':'text/html; charset=utf-8'}});

const safeNext=value=>{
  const v=String(value??'');
  return v.startsWith('/')&&!v.startsWith('//')?v:'/account';
};

const getBillDetail=async(env,instrument)=>{
  const bill=await env.DB.prepare(`SELECT b.id,b.official_bill_id,b.instrument,b.instrument_type,b.bill_number,b.origin_chamber,b.subject,b.official_description,b.official_status,b.normalized_status,b.act_number,b.effective_date,b.source_url,b.last_synced_at,b.created_at,b.updated_at,s.id AS session_id,s.session_code,s.session_name,s.legislature_number,s.session_type,s.start_date AS session_start_date,s.end_date AS session_end_date,s.is_active AS session_is_active FROM bills b JOIN sessions s ON s.id=b.session_id WHERE b.instrument=?1 ORDER BY s.start_date DESC,s.id DESC LIMIT 1`).bind(instrument).first();
  if(!bill)return null;
  const[authorRes,actionRes,voteRes,memberRes]=await env.DB.batch([
    env.DB.prepare(`SELECT l.id,l.official_id,l.display_name,l.first_name,l.last_name,l.chamber,l.district_number,l.party FROM bill_authors ba JOIN legislators l ON l.id=ba.legislator_id WHERE ba.bill_id=?1 AND ba.author_type='PRIMARY' ORDER BY ba.id LIMIT 1`).bind(bill.id),
    env.DB.prepare(`SELECT id,action_date,chamber,official_text,normalized_action,journal_page,journal_url,video_url,source_order FROM bill_actions WHERE bill_id=?1 ORDER BY source_order ASC,id ASC`).bind(bill.id),
    env.DB.prepare(`SELECT ve.id,ve.chamber,ve.committee_id,c.official_name AS committee_name,c.short_name AS committee_short_name,ve.event_type,ve.motion,ve.sequence_number,ve.vote_date,ve.vote_time,ve.yea_total,ve.nay_total,ve.absent_total,ve.present_total,ve.vote_method,ve.source_url FROM vote_events ve LEFT JOIN committees c ON c.id=ve.committee_id WHERE ve.bill_id=?1 ORDER BY ve.vote_date ASC,ve.vote_time ASC,ve.sequence_number ASC,ve.id ASC`).bind(bill.id),
    env.DB.prepare(`SELECT lv.vote_event_id,l.id AS legislator_id,l.official_id,l.display_name,l.chamber,l.district_number,l.party,lv.vote FROM legislator_votes lv JOIN legislators l ON l.id=lv.legislator_id JOIN vote_events ve ON ve.id=lv.vote_event_id WHERE ve.bill_id=?1 ORDER BY lv.vote_event_id ASC,l.last_name ASC,l.display_name ASC`).bind(bill.id)
  ]);
  const memberVotesByEvent=new Map();
  for(const row of memberRes.results){const{vote_event_id,...member}=row;if(!memberVotesByEvent.has(vote_event_id))memberVotesByEvent.set(vote_event_id,[]);memberVotesByEvent.get(vote_event_id).push(member)}
  const voteEvents=voteRes.results.map(ve=>{const{committee_id,committee_name,committee_short_name,...rest}=ve;return{...rest,committee:committee_id?{id:committee_id,name:committee_name,short_name:committee_short_name}:null,member_votes:memberVotesByEvent.get(ve.id)??[]}});
  const{session_id,session_code,session_name,legislature_number,session_type,session_start_date,session_end_date,session_is_active,...billFields}=bill;
  return{...billFields,session:{id:session_id,code:session_code,name:session_name,legislature_number,type:session_type,start_date:session_start_date,end_date:session_end_date,is_active:Boolean(session_is_active)},primary_author:authorRes.results[0]??null,actions:actionRes.results,vote_events:voteEvents};
};

const getBills=async(env,query='',limit=100)=>{
  const q=query.trim();
  if(!q){const{results}=await env.DB.prepare(`SELECT b.id,b.instrument,b.origin_chamber,b.subject,b.official_description,b.official_status,b.normalized_status,b.act_number,b.effective_date FROM bills b JOIN sessions s ON s.id=b.session_id ORDER BY s.start_date DESC,b.updated_at DESC,b.id DESC LIMIT ?1`).bind(limit).all();return results}
  const like=`%${q}%`;const{results}=await env.DB.prepare(`SELECT b.id,b.instrument,b.origin_chamber,b.subject,b.official_description,b.official_status,b.normalized_status,b.act_number,b.effective_date FROM bills b JOIN sessions s ON s.id=b.session_id WHERE b.instrument LIKE ?1 OR b.subject LIKE ?1 OR b.official_description LIKE ?1 OR b.official_status LIKE ?1 ORDER BY s.start_date DESC,b.updated_at DESC,b.id DESC LIMIT ?2`).bind(like,limit).all();return results
};

const getLegislators=async env=>(await env.DB.prepare(`SELECT id,official_id,display_name,first_name,last_name,chamber,district_number,party,is_active FROM legislators WHERE is_active=1 ORDER BY chamber,district_number,last_name`).all()).results;

const getLegislator=async(env,id)=>{
  const legislator=await env.DB.prepare(`SELECT id,official_id,display_name,first_name,last_name,chamber,district_number,party,is_active FROM legislators WHERE id=?1 LIMIT 1`).bind(id).first();
  if(!legislator)return null;
  const[billRes,voteRes]=await env.DB.batch([
    env.DB.prepare(`SELECT b.instrument,b.subject,b.official_description,b.normalized_status FROM bill_authors ba JOIN bills b ON b.id=ba.bill_id WHERE ba.legislator_id=?1 ORDER BY b.updated_at DESC,b.id DESC LIMIT 20`).bind(id),
    env.DB.prepare(`SELECT b.instrument,b.subject,ve.event_type,ve.motion,ve.vote_date,ve.vote_time,lv.vote FROM legislator_votes lv JOIN vote_events ve ON ve.id=lv.vote_event_id JOIN bills b ON b.id=ve.bill_id WHERE lv.legislator_id=?1 ORDER BY ve.vote_date DESC,ve.vote_time DESC,ve.id DESC LIMIT 50`).bind(id)
  ]);
  return{...legislator,authored_bills:billRes.results,recent_votes:voteRes.results}
};

const validInstrument=value=>/^(HB|SB|HCR|SCR|HR|SR)\d+$/.test(value);

async function latestBillId(env,instrument){
  return (await env.DB.prepare(`SELECT b.id FROM bills b JOIN sessions s ON s.id=b.session_id WHERE b.instrument=?1 ORDER BY s.start_date DESC,s.id DESC LIMIT 1`).bind(instrument).first())?.id??null;
}

async function getUserPosition(env,userId,instrument){
  const row=await env.DB.prepare(`SELECT ubp.position FROM user_bill_positions ubp JOIN bills b ON b.id=ubp.bill_id JOIN sessions s ON s.id=b.session_id WHERE ubp.user_id=?1 AND b.instrument=?2 ORDER BY s.start_date DESC,s.id DESC LIMIT 1`).bind(userId,instrument).first();
  return row?.position??null;
}

async function getUserPositions(env,userId){
  return (await env.DB.prepare(`SELECT ubp.position,ubp.updated_at,b.instrument,b.subject,b.official_description FROM user_bill_positions ubp JOIN bills b ON b.id=ubp.bill_id JOIN sessions s ON s.id=b.session_id WHERE ubp.user_id=?1 ORDER BY ubp.updated_at DESC`).bind(userId).all()).results;
}

function comparisonPriority(motion=''){
  const m=String(motion).toUpperCase();
  if(m.includes('VETO')&&m.includes('OVERRIDE'))return 40;
  if(m.includes('CONCUR')||m.includes('CONFERENCE'))return 30;
  if(m.includes('FINAL PASSAGE'))return 20;
  return 0;
}

async function getAlignment(env,userId){
  const rows=(await env.DB.prepare(`SELECT ubp.bill_id,ubp.position AS user_position,b.instrument,l.id AS legislator_id,l.display_name,l.party,l.chamber,l.district_number,lv.vote,ve.id AS vote_event_id,ve.motion,ve.vote_date,ve.vote_time FROM user_bill_positions ubp JOIN bills b ON b.id=ubp.bill_id JOIN vote_events ve ON ve.bill_id=b.id AND ve.event_type='FLOOR' JOIN legislator_votes lv ON lv.vote_event_id=ve.id JOIN legislators l ON l.id=lv.legislator_id WHERE ubp.user_id=?1 AND lv.vote IN ('YEA','NAY')`).bind(userId).all()).results;

  const chosen=new Map();
  for(const r of rows){
    const priority=comparisonPriority(r.motion);
    if(!priority)continue;
    const key=`${r.bill_id}:${r.legislator_id}`;
    const rank=`${String(priority).padStart(2,'0')}:${r.vote_date??''}:${r.vote_time??''}:${String(r.vote_event_id).padStart(12,'0')}`;
    const current=chosen.get(key);
    if(!current||rank>current.rank)chosen.set(key,{...r,rank});
  }

  const scores=new Map();
  for(const r of chosen.values()){
    if(!scores.has(r.legislator_id))scores.set(r.legislator_id,{legislator_id:r.legislator_id,display_name:r.display_name,party:r.party,chamber:r.chamber,district_number:r.district_number,matches:0,disagreements:0,comparable:0});
    const s=scores.get(r.legislator_id);
    const match=(r.user_position==='YES'&&r.vote==='YEA')||(r.user_position==='NO'&&r.vote==='NAY');
    s.comparable+=1;if(match)s.matches+=1;else s.disagreements+=1;
  }
  return [...scores.values()].map(s=>({...s,percent:s.comparable?Math.round((s.matches/s.comparable)*100):0})).sort((a,b)=>b.percent-a.percent||b.comparable-a.comparable||a.display_name.localeCompare(b.display_name));
}

async function requireSession(env,request){
  const session=await getSession(env,request);
  return session?.user?session:null;
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);

    if(!env.DB){
      if(url.pathname.startsWith('/api/'))return json({ok:false,error:'Database not bound'},503);
      return html(renderNotFound('Database is not available.'),503);
    }

    if(url.pathname.startsWith('/api/auth/')){
      try{return (await createAuth(env)).handler(request)}
      catch(err){return json({ok:false,error:'Authentication is not configured',detail:String(err?.message??err)},503)}
    }

    if(url.pathname==='/auth/google'||url.pathname==='/auth/apple'){
      const provider=url.pathname.endsWith('google')?'google':'apple';
      try{return await beginSocialSignIn(env,request,provider,safeNext(url.searchParams.get('next')))}
      catch(err){return html(renderNotFound(`Could not start ${provider} sign-in: ${String(err?.message??err)}`),500)}
    }

    if(url.pathname==='/api/health')return json({ok:true,service:'LeLegis',databaseBound:true,authConfigured:Boolean(env.BETTER_AUTH_SECRET),providers:authProviders(env)});
    if(url.pathname==='/api/db-check'){const result=await env.DB.prepare("SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first();return json({ok:true,database:'connected',result})}

    if(url.pathname==='/api/bills'){const bills=await getBills(env,url.searchParams.get('q')??'',100);return json({ok:true,bills})}

    const apiBillMatch=url.pathname.match(/^\/api\/bills\/([^/]+)\/?$/);
    if(apiBillMatch&&request.method==='GET'){
      let instrument;try{instrument=decodeURIComponent(apiBillMatch[1]).trim().toUpperCase()}catch{return json({ok:false,error:'Invalid instrument'},400)}
      if(!validInstrument(instrument))return json({ok:false,error:'Invalid instrument'},400);
      try{await refreshBillForRequest(env.DB,instrument);await refreshBillDetailsForRequest(env.DB,instrument);const bill=await getBillDetail(env,instrument);if(!bill)return json({ok:false,error:'Bill not found',instrument},404);return json({ok:true,bill})}
      catch(err){return json({ok:false,error:'Failed to load bill',detail:String(err?.message??err)},500)}
    }

    const posApi=url.pathname.match(/^\/api\/me\/positions\/([^/]+)\/?$/);
    if(posApi){
      const session=await requireSession(env,request);if(!session)return json({ok:false,error:'Authentication required'},401);
      const instrument=decodeURIComponent(posApi[1]).trim().toUpperCase();
      if(!validInstrument(instrument))return json({ok:false,error:'Invalid instrument'},400);
      if(request.method==='GET')return json({ok:true,position:await getUserPosition(env,session.user.id,instrument)});
      if(request.method==='PUT'){
        const body=await request.json().catch(()=>({}));const position=String(body.position??'').toUpperCase();
        if(!['YES','NO'].includes(position))return json({ok:false,error:'position must be YES or NO'},400);
        const billId=await latestBillId(env,instrument);if(!billId)return json({ok:false,error:'Bill not found'},404);
        await env.DB.prepare(`INSERT INTO user_bill_positions(user_id,bill_id,position) VALUES(?1,?2,?3) ON CONFLICT(user_id,bill_id) DO UPDATE SET position=excluded.position,updated_at=CURRENT_TIMESTAMP`).bind(session.user.id,billId,position).run();
        return json({ok:true,position});
      }
      if(request.method==='DELETE'){const billId=await latestBillId(env,instrument);if(billId)await env.DB.prepare(`DELETE FROM user_bill_positions WHERE user_id=?1 AND bill_id=?2`).bind(session.user.id,billId).run();return json({ok:true})}
      return json({ok:false,error:'Method not allowed'},405);
    }

    if(url.pathname==='/api/me/alignment'){
      const session=await requireSession(env,request);if(!session)return json({ok:false,error:'Authentication required'},401);
      return json({ok:true,alignment:await getAlignment(env,session.user.id)});
    }

    const apiLegMatch=url.pathname.match(/^\/api\/legislators\/(\d+)\/?$/);
    if(apiLegMatch){const profile=await getLegislator(env,Number(apiLegMatch[1]));return profile?json({ok:true,legislator:profile}):json({ok:false,error:'Legislator not found'},404)}

    const session=await getSession(env,request);
    const signedIn=Boolean(session?.user);

    if(url.pathname==='/login'||url.pathname==='/login/'){
      if(signedIn)return Response.redirect(new URL(safeNext(url.searchParams.get('next')),url.origin).toString(),302);
      return html(renderLogin({providers:authProviders(env),next:safeNext(url.searchParams.get('next'))}));
    }

    if(url.pathname==='/account'||url.pathname==='/account/'){
      if(!signedIn)return Response.redirect(`${url.origin}/login?next=%2Faccount`,302);
      const[positions,alignment]=await Promise.all([getUserPositions(env,session.user.id),getAlignment(env,session.user.id)]);
      return html(renderAccount({user:session.user,positions,alignment}));
    }

    if(url.pathname==='/'||url.pathname==='')return html(renderHome({recentBills:await getBills(env,'',6),signedIn}));

    if(url.pathname==='/bills'||url.pathname==='/bills/'){const query=url.searchParams.get('q')??'';return html(renderBills({bills:await getBills(env,query,150),query,signedIn}))}

    const billPageMatch=url.pathname.match(/^\/bills\/([^/]+)\/?$/);
    if(billPageMatch){
      let instrument;try{instrument=decodeURIComponent(billPageMatch[1]).trim().toUpperCase()}catch{return html(renderNotFound('Invalid bill number.',signedIn),400)}
      if(!validInstrument(instrument))return html(renderNotFound('Invalid bill number.',signedIn),400);
      const bill=await getBillDetail(env,instrument);
      const position=signedIn?await getUserPosition(env,session.user.id,instrument):null;
      return bill?html(renderBill(bill,{signedIn,position})):html(renderNotFound(`${instrument} was not found.`,signedIn),404);
    }

    if(url.pathname==='/legislators'||url.pathname==='/legislators/')return html(renderLegislators({legislators:await getLegislators(env),signedIn}));

    const legPageMatch=url.pathname.match(/^\/legislators\/(\d+)\/?$/);
    if(legPageMatch){
      const id=Number(legPageMatch[1]);const profile=await getLegislator(env,id);
      let alignment=null;
      if(signedIn){const rows=await getAlignment(env,session.user.id);alignment=rows.find(x=>x.legislator_id===id)??null}
      return profile?html(renderLegislator(profile,{signedIn,alignment})):html(renderNotFound('Legislator not found.',signedIn),404);
    }

    return html(renderNotFound('Not found',signedIn),404);
  },

  async scheduled(_controller,env,ctx){if(!env.DB)return;ctx.waitUntil(syncActiveSessions(env.DB))}
};
