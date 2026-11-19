const BASE='https://lelegis.invalid';
const VOTE_FILTERS=['repVote','myVote'];
const FILTERS=[...VOTE_FILTERS,'chamber'];

// Only a local tracker path with supported query parameters may be a return link.
export function trackerBackPath(value){
  if(typeof value!=='string'||!value.startsWith('/?'))return '/';
  const url=new URL(value,BASE);
  if(url.origin!==BASE||url.pathname!=='/')return '/';
  const params=new URLSearchParams();
  const query=url.searchParams.get('q');
  if(query)params.set('q',query);
  for(const key of VOTE_FILTERS){
    const selection=url.searchParams.get(key);
    if(['voted','not-voted'].includes(selection))params.set(key,selection);
  }
  const chamber=url.searchParams.get('chamber');
  if(['house','senate'].includes(chamber))params.set('chamber',chamber);
  return params.size?`/?${params}`:'/';
}

export function billBackQuery(value){
  const back=trackerBackPath(value);
  return back==='/'?'':`?${new URLSearchParams({back})}`;
}

// A new OAuth sign-in starts with All filters, even from a bookmarked tracker URL.
export function resetSignInPath(value){
  const url=new URL(value,BASE);
  if(url.origin!==BASE)return '/account';
  if(['/','/bills','/bills/'].includes(url.pathname))for(const key of FILTERS)url.searchParams.delete(key);
  if(/^\/bills\/[^/]+\/?$/.test(url.pathname))url.searchParams.delete('back');
  return url.pathname+url.search+url.hash;
}
