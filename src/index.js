import { refreshBillDetailsForRequest } from './lib/bill-detail-sync.js';
import { fetchSummaryDocuments as fetchOfficialSummaryDocuments } from './lib/bill-summary-docs.js';
import { refreshBillForRequest, syncActiveSessions } from './lib/bill-sync.js';
import { createAuth, getSession, beginGoogleSignIn, authProviders } from './auth.js';
import { comparisonPriority, compareBillMembers } from './lib/bill-member-comparison.js';
import {
  renderHome, renderBills, renderBill, renderLegislators, renderLegislator,
  renderLogin, renderAccount, renderRepresentativeOnboarding, renderNotFound
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
  if(!q){const{results}=await env.DB.prepare(`SELECT
    b.id,b.instrument,b.origin_chamber,b.subject,b.official_description,
    b.official_status,b.normalized_status,b.act_number,b.effective_date,
    EXISTS(
      SELECT 1 FROM vote_events ve
      WHERE ve.bill_id=b.id
    ) AS has_any_vote,
    EXISTS(
      SELECT 1 FROM bill_actions ba
      WHERE ba.bill_id=b.id
        AND (
          UPPER(COALESCE(ba.normalized_action,'')) LIKE '%INTRODUC%'
          OR UPPER(COALESCE(ba.official_text,'')) LIKE '%INTRODUC%'
        )
    ) AS has_been_introduced
   FROM bills b JOIN sessions s ON s.id=b.session_id ORDER BY s.start_date DESC,b.updated_at DESC,b.id DESC LIMIT ?1`).bind(limit).all();return results}
  const like=`%${q}%`;const{results}=await env.DB.prepare(`SELECT b.id,b.instrument,b.origin_chamber,b.subject,b.official_description,b.official_status,b.normalized_status,b.act_number,b.effective_date FROM bills b JOIN sessions s ON s.id=b.session_id WHERE b.instrument LIKE ?1 OR b.subject LIKE ?1 OR b.official_description LIKE ?1 OR b.official_status LIKE ?1 ORDER BY s.start_date DESC,b.updated_at DESC,b.id DESC LIMIT ?2`).bind(like,limit).all();return results
};

async function getPersonalizedBills(env,{
  query='',
  userId=null,
  myVote='all',
  repVote='all',
  limit=5000
}={}){
  const validMyVote=new Set(['all','voted','not-voted']);
  const validRepVote=new Set(['all','voted','not-voted']);
  const userFilter=validMyVote.has(myVote)?myVote:'all';
  const repFilter=validRepVote.has(repVote)?repVote:'all';
  const q=String(query??'').trim();

  let houseRepresentativeId=null;
  let senateRepresentativeId=null;

  if(userId){
    const settings=await getSettings(env,userId);
    const houseDistrict=Number(settings?.house_district??0);
    const senateDistrict=Number(settings?.senate_district??0);

    if(houseDistrict){
      const rep=await env.DB.prepare(
        `SELECT id
           FROM legislators
          WHERE is_active=1
            AND chamber='HOUSE'
            AND district_number=?1
          LIMIT 1`
      ).bind(houseDistrict).first();
      houseRepresentativeId=rep?.id??null;
    }

    if(senateDistrict){
      const senator=await env.DB.prepare(
        `SELECT id
           FROM legislators
          WHERE is_active=1
            AND chamber='SENATE'
            AND district_number=?1
          LIMIT 1`
      ).bind(senateDistrict).first();
      senateRepresentativeId=senator?.id??null;
    }
  }

  const where=q
    ? `WHERE (
         b.instrument LIKE ?4 OR
         b.subject LIKE ?4 OR
         b.official_description LIKE ?4 OR
         b.official_status LIKE ?4
       )`
    : '';

  const selectSql=`SELECT
       b.id,
       b.instrument,
       b.origin_chamber,
       b.subject,
       b.official_description,
       b.official_status,
       b.normalized_status,
       b.act_number,
       b.effective_date,
       EXISTS(
         SELECT 1 FROM vote_events ve_any
          WHERE ve_any.bill_id=b.id
       ) AS has_any_vote,
       EXISTS(
         SELECT 1
           FROM bill_actions ba_intro
          WHERE ba_intro.bill_id=b.id
            AND (
              UPPER(COALESCE(ba_intro.normalized_action,'')) LIKE '%INTRODUC%'
              OR UPPER(COALESCE(ba_intro.official_text,'')) LIKE '%INTRODUC%'
            )
       ) AS has_been_introduced,
       EXISTS(
         SELECT 1
           FROM user_bill_positions ubp
          WHERE ubp.bill_id=b.id
            AND ubp.user_id=?1
       ) AS user_voted,
       (
         SELECT ubp.position
           FROM user_bill_positions ubp
          WHERE ubp.bill_id=b.id
            AND ubp.user_id=?1
          LIMIT 1
       ) AS user_position,

       EXISTS(
         SELECT 1
           FROM legislator_votes lv
           JOIN vote_events ve ON ve.id=lv.vote_event_id
          WHERE lv.legislator_id=?2
            AND ve.bill_id=b.id
            AND ve.chamber='HOUSE'
            AND ve.event_type='FLOOR'
            AND lv.vote IN ('YEA','NAY')
       ) AS house_representative_voted,

       EXISTS(
         SELECT 1
           FROM legislator_votes lv
           JOIN vote_events ve ON ve.id=lv.vote_event_id
          WHERE lv.legislator_id=?3
            AND ve.bill_id=b.id
            AND ve.chamber='SENATE'
            AND ve.event_type='FLOOR'
            AND lv.vote IN ('YEA','NAY')
       ) AS senate_representative_voted

     FROM bills b
     JOIN sessions s ON s.id=b.session_id
     ${where}
     ORDER BY s.start_date DESC,b.updated_at DESC,b.id DESC
     LIMIT ?5`;

  let rows=[];

  if(q){
    rows=(await env.DB.prepare(selectSql)
      .bind(
        userId??'',
        houseRepresentativeId??-1,
        senateRepresentativeId??-1,
        `%${q}%`,
        Math.max(limit,5000)
      )
      .all()).results??[];
  }else{
    const noQuerySql=selectSql.replace(where,'').replace('LIMIT ?5','LIMIT ?4');
    rows=(await env.DB.prepare(noQuerySql)
      .bind(
        userId??'',
        houseRepresentativeId??-1,
        senateRepresentativeId??-1,
        Math.max(limit,5000)
      )
      .all()).results??[];
  }

  const normalized=rows.map(row=>({
    ...row,
    user_voted:Boolean(row.user_voted),
    has_any_vote:Boolean(row.has_any_vote),
    has_been_introduced:Boolean(row.has_been_introduced),
    house_representative_voted:Boolean(row.house_representative_voted),
    senate_representative_voted:Boolean(row.senate_representative_voted),
    representative_voted:Boolean(
      row.house_representative_voted || row.senate_representative_voted
    )
  }));

  const filtered=normalized.filter(row=>{
    const userVoted=row.user_voted;
    const representativeVoted=row.representative_voted;

    if(userFilter==='voted'&&!userVoted) return false;
    if(userFilter==='not-voted'&&userVoted) return false;
    if(repFilter==='voted'&&!representativeVoted) return false;
    if(repFilter==='not-voted'&&representativeVoted) return false;
    return true;
  });

  return {
    bills:filtered.slice(0,limit),
    myVote:userFilter,
    repVote:repFilter,
    representativeAvailable:Boolean(houseRepresentativeId||senateRepresentativeId)
  };
}

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

async function getAlignment(env,userId){
  const rows=(await env.DB.prepare(`SELECT ubp.bill_id,ubp.position AS user_position,b.instrument,l.id AS legislator_id,l.display_name,l.party,l.chamber,l.district_number,lv.vote,ve.id AS vote_event_id,ve.motion,ve.vote_date,ve.vote_time FROM user_bill_positions ubp JOIN bills b ON b.id=ubp.bill_id JOIN vote_events ve ON ve.bill_id=b.id AND ve.event_type='FLOOR' JOIN legislator_votes lv ON lv.vote_event_id=ve.id JOIN legislators l ON l.id=lv.legislator_id WHERE ubp.user_id=?1 AND lv.vote IN ('YEA','NAY')`).bind(userId).all()).results;
  const chosen=new Map();
  for(const r of rows){
    const priority=comparisonPriority(r.motion,r.instrument);if(!priority)continue;
    const key=`${r.bill_id}:${r.legislator_id}`;
    const rank=`${String(priority).padStart(2,'0')}:${r.vote_date??''}:${r.vote_time??''}:${String(r.vote_event_id).padStart(12,'0')}`;
    const current=chosen.get(key);if(!current||rank>current.rank)chosen.set(key,{...r,rank});
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

async function getSettings(env,userId){
  let row=await env.DB.prepare(`SELECT house_district,senate_district,public_profile,public_alignment FROM user_settings WHERE user_id=?1`).bind(userId).first();
  if(!row){
    await env.DB.prepare(`INSERT OR IGNORE INTO user_settings(user_id) VALUES(?1)`).bind(userId).run();
    row={house_district:null,senate_district:null,public_profile:0,public_alignment:0};
  }
  return row;
}

async function getYourMembers(env,settings,alignment){
  const wanted=[];
  if(settings.house_district)wanted.push(['HOUSE',Number(settings.house_district)]);
  if(settings.senate_district)wanted.push(['SENATE',Number(settings.senate_district)]);
  if(!wanted.length)return [];
  const members=[];
  for(const[chamber,district]of wanted){
    const member=await env.DB.prepare(`SELECT id AS legislator_id,display_name,first_name,last_name,party,chamber,district_number FROM legislators WHERE is_active=1 AND chamber=?1 AND district_number=?2 LIMIT 1`).bind(chamber,district).first();
    if(member){
      const score=alignment.find(a=>a.legislator_id===member.legislator_id);
      members.push({...member,alignment:score??null});
    }
  }
  return members;
}

async function getDashboardStats(env,userId,positions,members){
  const [commentRow,swayRow]=await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM user_comments WHERE user_id=?1`).bind(userId),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM comment_likes cl JOIN user_comments uc ON uc.id=cl.comment_id WHERE uc.user_id=?1`).bind(userId)
  ]);
  const comparable=members.filter(m=>m.alignment?.comparable>0);
  const representativeAlignment=comparable.length
    ? Math.round(comparable.reduce((sum,m)=>sum+m.alignment.percent,0)/comparable.length)
    : null;
  return{
    billsVoted:positions.length,
    comments:Number(commentRow.results?.[0]?.count??0),
    sway:Number(swayRow.results?.[0]?.count??0),
    representativeAlignment
  };
}


function pointInRing(lon,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    const intersect=((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||Number.EPSILON)+xi);
    if(intersect) inside=!inside;
  }
  return inside;
}

function pointInPolygon(lon,lat,polygon){
  if(!polygon?.length||!pointInRing(lon,lat,polygon[0])) return false;
  for(let i=1;i<polygon.length;i++) if(pointInRing(lon,lat,polygon[i])) return false;
  return true;
}

function geometryContains(geometry,lon,lat){
  if(!geometry) return false;
  if(geometry.type==='Polygon') return pointInPolygon(lon,lat,geometry.coordinates);
  if(geometry.type==='MultiPolygon') return geometry.coordinates.some(p=>pointInPolygon(lon,lat,p));
  return false;
}

async function resolveDistrictAtPoint(env, chamber, lon, lat){
  const {results}=await env.DB.prepare(
    `SELECT district_number,geometry_json,geometry_gzip_b64,source_name,source_url,effective_label
       FROM district_geometries
      WHERE chamber=?1
        AND ?2 BETWEEN min_lon AND max_lon
        AND ?3 BETWEEN min_lat AND max_lat`
  ).bind(chamber,lon,lat).all();

  for(const row of results){
    try{
      let geometry;
      let encoded=row.geometry_gzip_b64;

      if(!encoded){
        const chunkRes=await env.DB.prepare(
          `SELECT chunk_text
             FROM district_geometry_chunks
            WHERE chamber=?1 AND district_number=?2
            ORDER BY chunk_index ASC`
        ).bind(chamber,row.district_number).all();

        if(chunkRes.results.length){
          encoded=chunkRes.results.map(x=>x.chunk_text).join('');
        }
      }

      if(encoded){
        const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
        const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        geometry=JSON.parse(await new Response(stream).text());
      }else{
        geometry=JSON.parse(row.geometry_json);
      }

      if(geometryContains(geometry,lon,lat)) return row;
    }catch{}
  }
  return null;
}

async function fetchJsonWithTimeout(url, options={}, timeoutMs=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:controller.signal});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{
    clearTimeout(timer);
  }
}

async function arcgisGeocode(singleLine,{postalOnly=false}={}){
  const u=new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates');
  u.searchParams.set('SingleLine',singleLine);
  u.searchParams.set('sourceCountry','USA');
  u.searchParams.set('searchExtent','-94.10,28.80,-88.70,33.10');
  u.searchParams.set('maxLocations','1');
  u.searchParams.set('forStorage','false');
  u.searchParams.set('outFields','Match_addr,Addr_type,Region,Postal');
  if(postalOnly) u.searchParams.set('category','Postal');
  u.searchParams.set('f','json');

  const data=await fetchJsonWithTimeout(u,{},8000);
  const candidate=data?.candidates?.[0];
  if(!candidate?.location) return null;

  const region=String(candidate.attributes?.Region??'').toUpperCase();
  if(region && region!=='LA' && region!=='LOUISIANA') return null;

  return {
    lon:Number(candidate.location.x),
    lat:Number(candidate.location.y),
    label:candidate.address||singleLine,
    approximate:postalOnly
  };
}

async function geocodeAddress(address){
  const value=String(address??'').trim();
  if(!value) return null;

  // First choice: U.S. Census Geocoder.
  try{
    const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    u.searchParams.set('address',value);
    u.searchParams.set('benchmark','Public_AR_Current');
    u.searchParams.set('format','json');

    const data=await fetchJsonWithTimeout(u,{},8000);
    const match=data?.result?.addressMatches?.[0];
    if(match?.coordinates){
      return {
        lon:Number(match.coordinates.x),
        lat:Number(match.coordinates.y),
        label:match.matchedAddress||value,
        approximate:false
      };
    }
  }catch{}

  // Fallback if Census is slow/unavailable or does not match the address.
  try{
    return await arcgisGeocode(value,{postalOnly:false});
  }catch{
    return null;
  }
}

async function geocodeZip(zip){
  const value=String(zip??'').trim();
  if(!/^\d{5}$/.test(value)) return null;

  // ArcGIS can geocode a postal code directly without a stored-geocode token.
  try{
    const result=await arcgisGeocode(`${value}, Louisiana`,{postalOnly:true});
    if(result) return {...result,label:`ZIP ${value}`,approximate:true};
  }catch{}

  // Legacy fallback, also hard-timed so it can never hang the request.
  try{
    const data=await fetchJsonWithTimeout(
      `https://api.zippopotam.us/us/${encodeURIComponent(value)}`,
      {},
      6000
    );
    const place=data?.places?.[0];
    if(!place) return null;
    const state=String(place['state abbreviation']??'').toUpperCase();
    if(state && state!=='LA') return null;
    return {
      lon:Number(place.longitude),
      lat:Number(place.latitude),
      label:`ZIP ${value}`,
      approximate:true
    };
  }catch{
    return null;
  }
}

async function representativeLookup(env,{mode,address,zip,lon,lat}){
  let point;
  if(mode==='address') point=await geocodeAddress(String(address??'').trim());
  else if(mode==='zip') point=await geocodeZip(String(zip??'').trim());
  else if(mode==='location') point={lon:Number(lon),lat:Number(lat),label:'Current location',approximate:false};
  else throw new Error('Invalid lookup mode');

  if(!point||!Number.isFinite(point.lon)||!Number.isFinite(point.lat)) return null;
  if(point.lat<28.8||point.lat>33.1||point.lon<-94.1||point.lon>-88.7) return null;

  const [house,senate]=await Promise.all([
    resolveDistrictAtPoint(env,'HOUSE',point.lon,point.lat),
    resolveDistrictAtPoint(env,'SENATE',point.lon,point.lat)
  ]);
  if(!house||!senate) return null;

  const [houseMember,senateMember]=await Promise.all([
    env.DB.prepare(`SELECT id,display_name,party,chamber,district_number FROM legislators WHERE is_active=1 AND chamber='HOUSE' AND district_number=?1 LIMIT 1`).bind(house.district_number).first(),
    env.DB.prepare(`SELECT id,display_name,party,chamber,district_number FROM legislators WHERE is_active=1 AND chamber='SENATE' AND district_number=?1 LIMIT 1`).bind(senate.district_number).first()
  ]);

  return {
    label:point.label,
    approximate:point.approximate,
    house:{district_number:house.district_number,member:houseMember,source_name:house.source_name,source_url:house.source_url},
    senate:{district_number:senate.district_number,member:senateMember,source_name:senate.source_name,source_url:senate.source_url}
  };
}


async function getBillCommunity(env,billId,userId=null){
  const counts=await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN position='YES' THEN 1 ELSE 0 END) AS yes_count,
       SUM(CASE WHEN position='NO' THEN 1 ELSE 0 END) AS no_count,
       COUNT(*) AS total_count
     FROM user_bill_positions
     WHERE bill_id=?1`
  ).bind(billId).first();

  let userPosition=null;
  if(userId){
    userPosition=(await env.DB.prepare(
      `SELECT position FROM user_bill_positions WHERE user_id=?1 AND bill_id=?2 LIMIT 1`
    ).bind(userId,billId).first())?.position??null;
  }

  const total=Number(counts?.total_count??0);
  const yes=Number(counts?.yes_count??0);
  const no=Number(counts?.no_count??0);

  return {
    yes,
    no,
    total,
    yes_percent:total?Math.round((yes/total)*100):0,
    user_position:userPosition
  };
}

async function getBillRepresentativeComparisons(env,userId,bill,userPosition){
  if(!userId)return [];
  const settings=await getSettings(env,userId);
  const members=await getYourMembers(env,settings,[]);
  return compareBillMembers(bill,members,userPosition);
}

async function getBillComments(env,billId,userId=null,sort='top'){
  const order=sort==='new'
    ? 'uc.created_at DESC, uc.id DESC'
    : 'like_count DESC, uc.created_at DESC, uc.id DESC';

  const {results}=await env.DB.prepare(
    `SELECT
       uc.id,
       uc.parent_comment_id,
       uc.user_id,
       uc.body,
       uc.created_at,
       u.name AS user_name,
       ubp.position AS user_position,
       COUNT(cl.id) AS like_count,
       MAX(CASE WHEN cl.user_id=?2 THEN 1 ELSE 0 END) AS liked_by_user
     FROM user_comments uc
     JOIN "user" u ON u.id=uc.user_id
     LEFT JOIN user_bill_positions ubp
       ON ubp.user_id=uc.user_id AND ubp.bill_id=uc.bill_id
     LEFT JOIN comment_likes cl ON cl.comment_id=uc.id
     WHERE uc.bill_id=?1
     GROUP BY uc.id
     ORDER BY ${order}`
  ).bind(billId,userId??'').all();

  const map=new Map();
  for(const row of results) map.set(row.id,{...row,replies:[]});
  const roots=[];
  for(const row of map.values()){
    if(row.parent_comment_id && map.has(row.parent_comment_id)){
      map.get(row.parent_comment_id).replies.push(row);
    }else{
      roots.push(row);
    }
  }

  return { count:results.length, comments:roots };
}

async function createBillComment(env,userId,billId,body,parentCommentId=null){
  const text=String(body??'').trim();
  if(!text) throw new Error('Comment cannot be empty.');
  if(text.length>4000) throw new Error('Comment must be 4,000 characters or less.');

  let parent=null;
  if(parentCommentId){
    parent=await env.DB.prepare(
      `SELECT id FROM user_comments WHERE id=?1 AND bill_id=?2 LIMIT 1`
    ).bind(Number(parentCommentId),billId).first();
    if(!parent) throw new Error('Reply target not found.');
  }

  await env.DB.prepare(
    `INSERT INTO user_comments(user_id,bill_id,parent_comment_id,body)
     VALUES(?1,?2,?3,?4)`
  ).bind(userId,billId,parent?.id??null,text).run();
}

function billStage(bill){
  const status=String(bill.normalized_status??'').toUpperCase();
  const text=String(bill.official_status??'').toUpperCase();
  if(bill.act_number||status.includes('SIGNED')||text.includes('SIGNED')) return 5;
  if(status.includes('PASSED')||text.includes('PASSED')) return 4;
  if((bill.vote_events??[]).some(v=>v.event_type==='FLOOR')) return 2;
  if((bill.vote_events??[]).some(v=>v.committee)) return 1;
  return 0;
}


const SUMMARY_MODEL='@cf/google/gemma-4-26b-a4b-it';

function decodeEntities(value=''){
  return String(value)
    .replaceAll('&amp;','&')
    .replaceAll('&quot;','"')
    .replaceAll('&#39;',"'")
    .replaceAll('&lt;','<')
    .replaceAll('&gt;','>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}

function cleanAnchorText(value=''){
  return decodeEntities(String(value)
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .trim());
}

function canonicalDocumentUrl(href=''){
  try{
    const url=new URL(decodeEntities(href),'https://legis.la.gov/');
    const d=url.searchParams.get('d');
    if(/ViewDocument\.aspx$/i.test(url.pathname)&&/^\d+$/.test(d??'')){
      return `https://legis.la.gov/Legis/ViewDocument.aspx?d=${d}`;
    }
    return url.toString();
  }catch{
    return null;
  }
}

function documentId(url=''){
  try{return Number(new URL(url).searchParams.get('d')??0)}
  catch{return 0}
}

function summaryDocumentScore(title=''){
  const t=String(title).toLowerCase();
  if(t.includes('resume digest')) return 100;
  if(/summary of .*amendments/.test(t)) return 95;
  if(t.includes('conference committee report')) return 92;
  if(t.includes('veto message')) return 90;
  if(t.includes('fiscal note')) return 85;
  if(t.includes('digest')) return 80;
  if(t.includes('amendment')&&t.includes('adopted')) return 60;
  return 0;
}

function chooseSummaryDocuments(html=''){
  const source=String(html);
  const candidates=[];

  // 1. Normal anchors where the document title is inside the <a>.
  const anchorRe=/<a\b[^>]*(?:href|onclick)=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=anchorRe.exec(source))){
    const attr=decodeEntities(m[1]);
    const title=cleanAnchorText(m[2]);
    const idMatch=attr.match(/ViewDocument\.aspx\?[^"'<>]*\bd=(\d+)/i)
      || attr.match(/\bd=(\d+)\b/i);

    if(!idMatch) continue;

    const id=Number(idMatch[1]);
    const url=`https://legis.la.gov/Legis/ViewDocument.aspx?d=${id}`;
    const score=summaryDocumentScore(title);
    if(score) candidates.push({title,url,score,id});
  }

  // 2. ASP.NET sometimes puts the URL in JavaScript/markup separate from
  // the visible title. Find every ViewDocument ID and classify from nearby text.
  const docRe=/ViewDocument\.aspx\?[^"'<>\\s]*?\bd=(\d+)/gi;
  while((m=docRe.exec(source))){
    const id=Number(m[1]);
    const start=Math.max(0,m.index-900);
    const end=Math.min(source.length,m.index+1400);
    const nearby=cleanAnchorText(source.slice(start,end));

    const knownPatterns=[
      /Resume Digest for\s+[A-Z]{1,4}\s*\d+/i,
      /Summary of (?:House|Senate) Amendments to\s+[A-Z]{1,4}\s*\d+/i,
      /Conference Committee Report[^|<]*/i,
      /[A-Z]{1,4}\s*\d+\s+Veto Message/i,
      /Veto Message/i,
      /Fiscal Note[^|<]*/i,
      /Digest of\s+[A-Z]{1,4}\s*\d+\s+(?:Engrossed|Reengrossed|Original|Enrolled)/i,
      /Digest of\s+[A-Z]{1,4}\s*\d+/i,
      /(?:House|Senate) (?:Floor|Committee) Amendment[^|<]*(?:Adopted|Draft)?/i
    ];

    let title='';
    let score=0;
    for(const re of knownPatterns){
      const hit=nearby.match(re);
      if(hit){
        const candidate=hit[0].replace(/\s+/g,' ').trim();
        const candidateScore=summaryDocumentScore(candidate);
        if(candidateScore>score){
          title=candidate;
          score=candidateScore;
        }
      }
    }

    if(score){
      candidates.push({
        title,
        url:`https://legis.la.gov/Legis/ViewDocument.aspx?d=${id}`,
        score,
        id
      });
    }
  }

  // 3. Last fallback: pair known visible labels with the nearest document ID
  // in the surrounding raw markup.
  const labels=[
    ['Resume Digest',100],
    ['Summary of Senate Amendments',95],
    ['Summary of House Amendments',95],
    ['Conference Committee Report',92],
    ['Veto Message',90],
    ['Fiscal Note',85],
    ['Digest of',80]
  ];

  for(const [label,score] of labels){
    let pos=0;
    while((pos=source.toLowerCase().indexOf(label.toLowerCase(),pos))!==-1){
      const start=Math.max(0,pos-1800);
      const end=Math.min(source.length,pos+1800);
      const window=source.slice(start,end);
      const ids=[...window.matchAll(/(?:ViewDocument\.aspx\?[^"'<>\\s]*?\bd=|\bd=)(\d+)/gi)]
        .map(x=>Number(x[1]))
        .filter(Boolean);

      if(ids.length){
        // Prefer the closest visible ViewDocument reference in this small window.
        const id=ids[Math.floor(ids.length/2)];
        const titleWindow=cleanAnchorText(source.slice(pos,Math.min(source.length,pos+180)));
        const title=titleWindow.split(/\s{2,}/)[0]||label;
        candidates.push({
          title,
          url:`https://legis.la.gov/Legis/ViewDocument.aspx?d=${id}`,
          score,
          id
        });
      }
      pos+=label.length;
    }
  }

  const deduped=[...new Map(
    candidates
      .sort((a,b)=>b.score-a.score||b.id-a.id)
      .map(x=>[x.url,x])
  ).values()];

  const by=(predicate)=>deduped
    .filter(predicate)
    .sort((a,b)=>b.score-a.score||b.id-a.id);

  const chosen=[];
  const add=(doc)=>{if(doc&&!chosen.some(x=>x.url===doc.url)) chosen.push(doc)};

  add(by(x=>/resume digest/i.test(x.title))[0]);
  add(by(x=>/summary of .*amendments/i.test(x.title))[0]);
  add(by(x=>/conference committee report/i.test(x.title))[0]);
  add(by(x=>/veto message/i.test(x.title))[0]);
  add(by(x=>/fiscal note/i.test(x.title))[0]);

  const digests=by(x=>/\bdigest\b/i.test(x.title)&&!/resume digest/i.test(x.title));
  add(digests[0]);
  add(digests.find(x=>/original/i.test(x.title)));

  if(chosen.length<4){
    for(const doc of deduped){
      add(doc);
      if(chosen.length>=7) break;
    }
  }

  return chosen.slice(0,7).map(({title,url})=>({title,url}));
}
async function summarySourceSignature(bill,documents){
  const payload=JSON.stringify({
    bill_id:bill.id,
    official_status:bill.official_status,
    act_number:bill.act_number,
    effective_date:bill.effective_date,
    documents
  });
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function fetchSummaryDocuments(bill){
  const candidates=[];

  // Most reliable Louisiana Legislature route for a known bill/session.
  if(bill.instrument&&bill.session?.code){
    candidates.push(
      `https://legis.la.gov/Legis/BillInfo.aspx?b=${encodeURIComponent(bill.instrument)}&s=${encodeURIComponent(String(bill.session.code).toLowerCase())}&sbi=y`
    );
  }

  // Existing stored source URL can also be useful.
  if(bill.source_url){
    try{
      const u=new URL(bill.source_url,'https://legis.la.gov/');
      u.searchParams.set('sbi','y');
      candidates.push(u.toString());
    }catch{}
  }

  // Last-resort legacy ID route.
  if(bill.official_bill_id){
    candidates.push(
      `https://legis.la.gov/Legis/BillInfo.aspx?i=${encodeURIComponent(bill.official_bill_id)}&sbi=y`
    );
  }

  const seen=new Set();
  const all=[];

  for(const url of candidates){
    if(!url||seen.has(url)) continue;
    seen.add(url);

    try{
      const r=await fetch(url,{
        redirect:'follow',
        headers:{
          'user-agent':'LeLegis/1.0 (+https://legis.le-comrade.org)',
          accept:'text/html,application/xhtml+xml'
        }
      });
      if(!r.ok) continue;

      const docs=chooseSummaryDocuments(await r.text());
      for(const doc of docs){
        if(!all.some(x=>x.url===doc.url)) all.push(doc);
      }

      // One correct bill page is enough.
      if(all.length) break;
    }catch{}
  }

  return all;
}

async function documentToText(env,doc){
  const r=await fetch(doc.url,{
    redirect:'follow',
    headers:{
      'user-agent':'LeLegis/1.0 (+https://legis.le-comrade.org)',
      accept:'application/pdf,*/*'
    }
  });

  if(!r.ok){
    throw new Error(`DOCUMENT_FETCH_HTTP_${r.status}: ${doc.title}`);
  }

  const bytes=await r.arrayBuffer();
  if(!bytes.byteLength){
    throw new Error(`DOCUMENT_EMPTY: ${doc.title}`);
  }

  const converted=await env.AI.toMarkdown(
    {
      name:'document.pdf',
      blob:new Blob([bytes],{type:'application/pdf'})
    },
    {
      conversionOptions:{
        output:{format:'text'},
        pdf:{metadata:false}
      }
    }
  );

  const result=Array.isArray(converted)?converted[0]:converted;

  if(!result){
    throw new Error(`TOMARKDOWN_NO_RESULT: ${doc.title}`);
  }

  if(result.format==='error'){
    throw new Error(`TOMARKDOWN_ERROR: ${result.error||'unknown conversion error'}: ${doc.title}`);
  }

  const text=String(result.data??'').replace(/\u0000/g,'').trim();
  if(!text){
    throw new Error(`TOMARKDOWN_EMPTY_TEXT: ${doc.title}`);
  }

  return {
    ...doc,
    text:text.slice(0,30000),
    conversion:{
      format:result.format??null,
      mimetype:result.mimetype??result.mimeType??null,
      tokens:Number(result.tokens??0)||null,
      source_bytes:bytes.byteLength
    }
  };
}
function compactGeneratedSummary(value=''){
  let text=String(value??'')
    .replace(/^#+\s*/gm,'')
    .replace(/^\s*[-*]\s+/gm,'')
    .replace(/\s+/g,' ')
    .trim();

  text=text.replace(/^["“]|["”]$/g,'').trim();

  const words=text.split(/\s+/);
  if(words.length>220){
    const clipped=words.slice(0,220).join(' ');
    const lastStop=Math.max(clipped.lastIndexOf('.'),clipped.lastIndexOf('!'),clipped.lastIndexOf('?'));
    text=lastStop>120?clipped.slice(0,lastStop+1):clipped+'.';
  }
  return text;
}

function extractAiText(result){
  if(typeof result==='string') return result;
  if(typeof result?.response==='string') return result.response;
  if(typeof result?.result==='string') return result.result;
  if(typeof result?.output_text==='string') return result.output_text;

  const content=result?.choices?.[0]?.message?.content;
  if(typeof content==='string') return content;
  if(Array.isArray(content)){
    return content
      .map(part=>typeof part==='string'?part:(part?.text??part?.content??''))
      .filter(Boolean)
      .join('\n');
  }

  return '';
}
async function generateBillSummary(env,bill,documents){
  const converted=[];
  const conversionErrors=[];

  for(const doc of documents){
    try{
      const item=await documentToText(env,doc);
      if(item) converted.push(item);
    }catch(err){
      conversionErrors.push({
        title:doc.title,
        url:doc.url,
        error:String(err?.message??err)
      });
    }
  }

  if(!converted.length){
    return {
      ok:false,
      reason:'NO_DOCUMENT_TEXT',
      conversion_errors:conversionErrors
    };
  }

  const sourcePack=converted.map((doc,i)=>
    `SOURCE ${i+1}: ${doc.title}\n${doc.text}`
  ).join('\n\n---\n\n').slice(0,110000);

  const prompt=`You are writing the public-facing Bill Summary for LeLegis, a neutral Louisiana legislative information service.

Write ONE brief plain-English paragraph, ideally 110-180 words and never more than 220 words. Do not use headings, bullets, labels, markdown, citations, or separate sections.

The paragraph should naturally answer as many of these questions as the official material supports:
- What does the bill actually do?
- What are the most important changes from current law, policy, or funding?
- Who is materially affected?
- What money, spending, revenue, fees, taxes, or fiscal effects matter?
- What deadlines, exceptions, enforcement powers, eligibility rules, transfers of authority, or other details matter?
- Did adopted amendments, conference changes, or vetoes materially change the bill during the process?
- What practical tradeoffs or considerations should a voter understand?

Rules:
1. Use ONLY facts supported by the official Louisiana documents below.
2. Do not invent effects, motives, winners, losers, controversy, or policy arguments.
3. Distinguish final/adopted changes from proposals, drafts, rejected amendments, or earlier versions.
4. If the sources do not establish a fiscal effect, affected group, process change, or tradeoff, omit it rather than speculate.
5. Translate legal and budget language into ordinary language without watering down important numbers or exceptions.
6. Prioritize consequential changes over ceremonial, technical, or procedural detail.
7. If a fiscal note says there is no material fiscal impact, you may say so briefly if useful.
8. Do not merely paraphrase the bill caption.
9. Keep a neutral informational tone. "Things to consider" means factual consequences or implementation considerations supported by the record, not reasons to vote yes or no.

Bill: ${bill.instrument}
Subject: ${bill.subject??''}
Official description: ${bill.official_description??''}
Status: ${bill.official_status??''}
Act number: ${bill.act_number??''}
Effective date: ${bill.effective_date??''}

OFFICIAL LOUISIANA SOURCES:
${sourcePack}`;

  let result;
  try{
    result=await env.AI.run(SUMMARY_MODEL,{
      messages:[
        {
          role:'system',
          content:'Produce accurate, neutral, source-grounded legislative summaries for the public. Return only the final paragraph.'
        },
        {role:'user',content:prompt}
      ],
      chat_template_kwargs:{
        enable_thinking:false
      },
      temperature:0.1,
      max_completion_tokens:700
    });
  }catch(err){
    return {
      ok:false,
      reason:'MODEL_ERROR',
      model_error:String(err?.message??err),
      converted_documents:converted.map(({title,url,conversion})=>({title,url,conversion})),
      conversion_errors:conversionErrors
    };
  }

  const rawText=extractAiText(result);
  const summary=compactGeneratedSummary(rawText);

  if(summary.split(/\s+/).filter(Boolean).length<35){
    return {
      ok:false,
      reason:'MODEL_EMPTY_OR_TOO_SHORT',
      raw_response_shape:{
        type:typeof result,
        keys:result&&typeof result==='object'?Object.keys(result):[],
        choice_keys:result?.choices?.[0]?Object.keys(result.choices[0]):[],
        message_keys:result?.choices?.[0]?.message?Object.keys(result.choices[0].message):[]
      },
      raw_text_preview:String(rawText??'').slice(0,500),
      converted_documents:converted.map(({title,url,conversion})=>({title,url,conversion})),
      conversion_errors:conversionErrors
    };
  }

  return {
    ok:true,
    summary,
    used_documents:converted.map(({title,url,conversion})=>({title,url,conversion})),
    conversion_errors:conversionErrors
  };
}
async function ensureBillSummary(env,bill,{force=false}={}){
  let documents=[];
  let discoveryError=null;

  try{
    documents=await fetchOfficialSummaryDocuments(bill);
  }catch(err){
    discoveryError=String(err?.message??err);
  }

  if(!env.AI){
    return {
      text:bill.official_description||'No summary is currently available.',
      sources:documents,
      generated:false,
      reason:'AI_BINDING_MISSING',
      discovery_error:discoveryError
    };
  }

  if(!documents.length){
    return {
      text:bill.official_description||'No summary is currently available.',
      sources:[],
      generated:false,
      reason:'NO_SOURCE_DOCUMENTS',
      discovery_error:discoveryError
    };
  }

  const signature=await summarySourceSignature(bill,documents);
  const cached=await env.DB.prepare(
    `SELECT summary_text,source_signature,source_documents_json,model,generated_at
       FROM bill_summaries
      WHERE bill_id=?1`
  ).bind(bill.id).first();

  if(!force&&cached?.summary_text&&cached.source_signature===signature){
    let sources=[];
    try{sources=JSON.parse(cached.source_documents_json??'[]')}catch{}
    return {
      text:cached.summary_text,
      sources,
      generated:true,
      generated_at:cached.generated_at
    };
  }

  const generated=await generateBillSummary(env,bill,documents);
  if(!generated?.ok){
    let cachedSources=[];
    try{cachedSources=JSON.parse(cached?.source_documents_json??'[]')}catch{}
    return {
      text:cached?.summary_text||bill.official_description||'No summary is currently available.',
      sources:cachedSources,
      generated:Boolean(cached?.summary_text),
      reason:generated?.reason||'GENERATION_FAILED',
      model_error:generated?.model_error??null,
      conversion_errors:generated?.conversion_errors??[],
      converted_documents:generated?.converted_documents??[],
      raw_response_shape:generated?.raw_response_shape??null,
      raw_text_preview:generated?.raw_text_preview??null
    };
  }

  await env.DB.prepare(
    `INSERT INTO bill_summaries(
       bill_id,summary_text,source_signature,source_documents_json,model,generated_at
     ) VALUES(?1,?2,?3,?4,?5,CURRENT_TIMESTAMP)
     ON CONFLICT(bill_id) DO UPDATE SET
       summary_text=excluded.summary_text,
       source_signature=excluded.source_signature,
       source_documents_json=excluded.source_documents_json,
       model=excluded.model,
       generated_at=CURRENT_TIMESTAMP`
  ).bind(
    bill.id,
    generated.summary,
    signature,
    JSON.stringify(generated.used_documents.map(({title,url})=>({title,url}))),
    SUMMARY_MODEL
  ).run();

  return {
    text:generated.summary,
    sources:generated.used_documents.map(({title,url})=>({title,url})),
    generated:true
  };
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

    if(url.pathname==='/auth/google'){
      try{return await beginGoogleSignIn(env,request,safeNext(url.searchParams.get('next')))}
      catch(err){return html(renderNotFound(`Could not start Google sign-in: ${String(err?.message??err)}`),500)}
    }

    if(url.pathname==='/api/health')return json({ok:true,service:'LeLegis',databaseBound:true,authConfigured:Boolean(env.BETTER_AUTH_SECRET),aiBound:Boolean(env.AI),providers:authProviders(env)});
    if(url.pathname==='/api/db-check'){const result=await env.DB.prepare("SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first();return json({ok:true,database:'connected',result})}

    if(url.pathname==='/api/bills'){const bills=await getBills(env,url.searchParams.get('q')??'',100);return json({ok:true,bills})}

    const apiBillMatch=url.pathname.match(/^\/api\/bills\/([^/]+)\/?$/);
    if(apiBillMatch&&request.method==='GET'){
      let instrument;try{instrument=decodeURIComponent(apiBillMatch[1]).trim().toUpperCase()}catch{return json({ok:false,error:'Invalid instrument'},400)}
      if(!validInstrument(instrument))return json({ok:false,error:'Invalid instrument'},400);
      try{
        await refreshBillForRequest(env.DB,instrument);
        await refreshBillDetailsForRequest(
          env.DB,
          instrument,
          fetch,
          {force:url.searchParams.get('refresh')==='1'}
        );
        const bill=await getBillDetail(env,instrument);
        if(!bill)return json({ok:false,error:'Bill not found',instrument},404);
        return json({ok:true,bill});
      }
      catch(err){return json({ok:false,error:'Failed to load bill',detail:String(err?.message??err)},500)}
    }

    const voteLinkMatch=url.pathname.match(/^\/vote\/([^/]+)\/(YES|NO)\/?$/);
    if(voteLinkMatch&&request.method==='GET'){
      try{
        const instrument=decodeURIComponent(voteLinkMatch[1]).trim().toUpperCase();
        const position=String(voteLinkMatch[2]).toUpperCase();

        if(!validInstrument(instrument)){
          return html(renderNotFound('Invalid bill number.',false,null),400);
        }

        const session=await requireSession(env,request);
        if(!session){
          return new Response(null,{
            status:303,
            headers:{location:`/login?next=${encodeURIComponent(`/bills/${instrument}#cast-vote`)}`}
          });
        }

        const billId=await latestBillId(env,instrument);
        if(!billId){
          return html(renderNotFound(`${instrument} was not found.`,true,session.user?.name??null),404);
        }

        const existing=await env.DB.prepare(
          `SELECT id FROM user_bill_positions WHERE user_id=?1 AND bill_id=?2 LIMIT 1`
        ).bind(session.user.id,billId).first();

        if(existing?.id){
          await env.DB.prepare(
            `UPDATE user_bill_positions
                SET position=?1,updated_at=CURRENT_TIMESTAMP
              WHERE id=?2`
          ).bind(position,existing.id).run();
        }else{
          await env.DB.prepare(
            `INSERT INTO user_bill_positions(user_id,bill_id,position)
             VALUES(?1,?2,?3)`
          ).bind(session.user.id,billId,position).run();
        }

        return new Response(null,{
          status:303,
          headers:{location:`/bills/${encodeURIComponent(instrument)}#cast-vote`}
        });
      }catch(err){
        return html(
          `<!doctype html><meta charset="utf-8"><title>Vote error</title>
           <body style="font-family:system-ui;padding:32px">
           <h1>Could not save vote</h1>
           <p>${String(err?.message??err).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</p>
           <p><a href="/bills">Back to bills</a></p>
           </body>`,
          500
        );
      }
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

    if(url.pathname==='/api/representatives/lookup'&&request.method==='POST'){
      const session=await requireSession(env,request);if(!session)return json({ok:false,error:'Authentication required'},401);
      const body=await request.json().catch(()=>({}));
      try{
        const result=await representativeLookup(env,body);
        if(!result)return json({ok:false,error:'Could not determine Louisiana legislative districts for that location.'},404);
        return json({ok:true,result});
      }catch(err){
        return json({ok:false,error:String(err?.message??err)},400);
      }
    }

    if(url.pathname==='/api/me/settings'&&request.method==='PUT'){
      const session=await requireSession(env,request);if(!session)return json({ok:false,error:'Authentication required'},401);
      const body=await request.json().catch(()=>({}));
      const house=body.house_district===''||body.house_district==null?null:Number(body.house_district);
      const senate=body.senate_district===''||body.senate_district==null?null:Number(body.senate_district);
      if(house!==null&&(!Number.isInteger(house)||house<1||house>105))return json({ok:false,error:'House district must be 1 through 105'},400);
      if(senate!==null&&(!Number.isInteger(senate)||senate<1||senate>39))return json({ok:false,error:'Senate district must be 1 through 39'},400);
      await env.DB.prepare(`INSERT INTO user_settings(user_id,house_district,senate_district) VALUES(?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET house_district=excluded.house_district,senate_district=excluded.senate_district,updated_at=CURRENT_TIMESTAMP`).bind(session.user.id,house,senate).run();
      return json({ok:true,house_district:house,senate_district:senate});
    }

    if(url.pathname==='/api/me/delete-account'&&request.method==='DELETE'){
      const session=await requireSession(env,request);if(!session)return json({ok:false,error:'Authentication required'},401);
      const body=await request.json().catch(()=>({}));
      if(body.confirm!=='DELETE')return json({ok:false,error:'Type DELETE to confirm account deletion.'},400);
      await env.DB.prepare(`DELETE FROM "user" WHERE id=?1`).bind(session.user.id).run();
      return json({ok:true});
    }


    const commentListMatch=url.pathname.match(/^\/api\/bills\/([^/]+)\/comments\/?$/);
    if(commentListMatch){
      let instrument;
      try{instrument=decodeURIComponent(commentListMatch[1]).trim().toUpperCase()}catch{return json({ok:false,error:'Invalid instrument'},400)}
      if(!validInstrument(instrument))return json({ok:false,error:'Invalid instrument'},400);
      const billId=await latestBillId(env,instrument);
      if(!billId)return json({ok:false,error:'Bill not found'},404);

      if(request.method==='GET'){
        const session=await getSession(env,request);
        const sort=url.searchParams.get('sort')==='new'?'new':'top';
        return json({ok:true,...await getBillComments(env,billId,session?.user?.id??null,sort)});
      }

      if(request.method==='POST'){
        const session=await requireSession(env,request);
        if(!session)return json({ok:false,error:'Authentication required'},401);
        const body=await request.json().catch(()=>({}));
        try{
          await createBillComment(env,session.user.id,billId,body.body,body.parent_comment_id??null);
          return json({ok:true});
        }catch(err){
          return json({ok:false,error:String(err?.message??err)},400);
        }
      }

      return json({ok:false,error:'Method not allowed'},405);
    }

    const likeMatch=url.pathname.match(/^\/api\/comments\/(\d+)\/like\/?$/);
    if(likeMatch){
      const session=await requireSession(env,request);
      if(!session)return json({ok:false,error:'Authentication required'},401);
      const commentId=Number(likeMatch[1]);
      const exists=await env.DB.prepare(`SELECT id FROM user_comments WHERE id=?1`).bind(commentId).first();
      if(!exists)return json({ok:false,error:'Comment not found'},404);

      if(request.method==='POST'){
        await env.DB.prepare(
          `INSERT OR IGNORE INTO comment_likes(comment_id,user_id) VALUES(?1,?2)`
        ).bind(commentId,session.user.id).run();
        return json({ok:true});
      }
      if(request.method==='DELETE'){
        await env.DB.prepare(
          `DELETE FROM comment_likes WHERE comment_id=?1 AND user_id=?2`
        ).bind(commentId,session.user.id).run();
        return json({ok:true});
      }
      return json({ok:false,error:'Method not allowed'},405);
    }

    const summaryApiMatch=url.pathname.match(/^\/api\/bills\/([^/]+)\/summary\/?$/);
    if(summaryApiMatch){
      let instrument;
      try{instrument=decodeURIComponent(summaryApiMatch[1]).trim().toUpperCase()}catch{return json({ok:false,error:'Invalid instrument'},400)}
      if(!validInstrument(instrument))return json({ok:false,error:'Invalid instrument'},400);

      const bill=await getBillDetail(env,instrument);
      if(!bill)return json({ok:false,error:'Bill not found'},404);

      if(url.searchParams.get('debug')==='1'){
        try{
          const discovery=await fetchOfficialSummaryDocuments(bill,fetch,{includeDebug:true});
          return json({ok:true,discovery});
        }catch(err){
          return json({ok:false,error:'Summary discovery debug failed',detail:String(err?.message??err)},500);
        }
      }

      try{
        const summary=await ensureBillSummary(env,bill,{force:url.searchParams.get('refresh')==='1'});
        return json({ok:true,summary});
      }catch(err){
        return json({ok:false,error:'Summary generation failed',detail:String(err?.message??err)},500);
      }
    }

    const apiLegMatch=url.pathname.match(/^\/api\/legislators\/(\d+)\/?$/);
    if(apiLegMatch){const profile=await getLegislator(env,Number(apiLegMatch[1]));return profile?json({ok:true,legislator:profile}):json({ok:false,error:'Legislator not found'},404)}

    const session=await getSession(env,request);
    const signedIn=Boolean(session?.user);
    const userName=session?.user?.name??null;

    if(url.pathname==='/login'||url.pathname==='/login/'){
      if(signedIn)return Response.redirect(new URL(safeNext(url.searchParams.get('next')),url.origin).toString(),302);
      return html(renderLogin({providers:authProviders(env),next:safeNext(url.searchParams.get('next'))}));
    }

    if(url.pathname==='/account'||url.pathname==='/account/'){
      if(!signedIn)return Response.redirect(`${url.origin}/login?next=%2Faccount`,302);
      const[positions,alignment,settings]=await Promise.all([
        getUserPositions(env,session.user.id),
        getAlignment(env,session.user.id),
        getSettings(env,session.user.id)
      ]);
      if(!settings.house_district||!settings.senate_district){
        return Response.redirect(`${url.origin}/onboarding/representatives`,302);
      }
      const members=await getYourMembers(env,settings,alignment);
      const stats=await getDashboardStats(env,session.user.id,positions,members);
      return html(renderAccount({user:session.user,positions,alignment,settings,members,stats}));
    }

    if(url.pathname==='/onboarding/representatives'||url.pathname==='/onboarding/representatives/'){
      if(!signedIn)return Response.redirect(`${url.origin}/login?next=%2Fonboarding%2Frepresentatives`,302);
      const settings=await getSettings(env,session.user.id);
      return html(renderRepresentativeOnboarding({user:session.user,settings}));
    }

    if(url.pathname==='/'||url.pathname===''){
      const query=url.searchParams.get('q')??'';
      const repVote=url.searchParams.get('repVote')??'all';

      const billData=signedIn
        ? await getPersonalizedBills(env,{
            query,
            userId:session.user.id,
            myVote:'all',
            repVote,
            limit:5000
          })
        : {
            bills:await getBills(env,query,5000),
            myVote:'all',
            repVote:'all',
            representativeAvailable:false
          };

      return html(renderBills({
        bills:billData.bills,
        query,
        signedIn,
        userName,
        repVote:billData.repVote,
        representativeAvailable:billData.representativeAvailable
      }));
    }

    if(url.pathname==='/bills'||url.pathname==='/bills/'){
      const target=new URL('/',url.origin);
      for(const [key,value] of url.searchParams) target.searchParams.append(key,value);
      return Response.redirect(target.toString(),302);
    }

    const billPageMatch=url.pathname.match(/^\/bills\/([^/]+)\/?$/);
    if(billPageMatch){
      let instrument;try{instrument=decodeURIComponent(billPageMatch[1]).trim().toUpperCase()}catch{return html(renderNotFound('Invalid bill number.',signedIn,userName),400)}
      if(!validInstrument(instrument))return html(renderNotFound('Invalid bill number.',signedIn,userName),400);
      const bill=await getBillDetail(env,instrument);
      if(!bill)return html(renderNotFound(`${instrument} was not found.`,signedIn,userName),404);

      const community=await getBillCommunity(env,bill.id,signedIn?session.user.id:null);

      const [commentData,summaryData,representativeComparisons]=await Promise.all([
        getBillComments(env,bill.id,signedIn?session.user.id:null,'top'),
        ensureBillSummary(env,bill).catch(()=>({
          text:bill.official_description||'No summary is currently available.',
          sources:[],
          generated:false
        })),
        signedIn
          ? getBillRepresentativeComparisons(
              env,
              session.user.id,
              bill,
              community.user_position
            )
          : Promise.resolve([])
      ]);

      return html(renderBill(bill,{
        signedIn,
        position:community.user_position,
        userName,
        community,
        comments:commentData.comments,
        commentCount:commentData.count,
        stage:billStage(bill),
        summaryText:summaryData.text,
        summarySources:summaryData.sources,
        representativeComparisons
      }));
    }

    if(url.pathname==='/legislators'||url.pathname==='/legislators/')return html(renderLegislators({legislators:await getLegislators(env),signedIn,userName}));

    const legPageMatch=url.pathname.match(/^\/legislators\/(\d+)\/?$/);
    if(legPageMatch){
      const id=Number(legPageMatch[1]);const profile=await getLegislator(env,id);
      let alignment=null;
      if(signedIn){const rows=await getAlignment(env,session.user.id);alignment=rows.find(x=>x.legislator_id===id)??null}
      return profile?html(renderLegislator(profile,{signedIn,alignment,userName})):html(renderNotFound('Legislator not found.',signedIn,userName),404);
    }

    return html(renderNotFound('Not found',signedIn,userName),404);
  },

  async scheduled(_controller,env,ctx){if(!env.DB)return;ctx.waitUntil(syncActiveSessions(env.DB))}
};
