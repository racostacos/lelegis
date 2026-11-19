export function normalizeTrackerChamber(value){
  const chamber=String(value??'').toLowerCase();
  return ['house','senate'].includes(chamber)?chamber:'all';
}

// All selections are independent and intersect, rather than replacing one another.
export function filterTrackerBills(bills,myVote='all',repVote='all',chamber='all'){
  const selected=normalizeTrackerChamber(chamber);
  return bills.filter(bill=>{
    if(selected!=='all'&&String(bill.origin_chamber??'').toLowerCase()!==selected)return false;
    if(myVote==='voted'&&!bill.user_voted)return false;
    if(myVote==='not-voted'&&bill.user_voted)return false;
    if(repVote==='voted'&&!bill.representative_voted)return false;
    if(repVote==='not-voted'&&bill.representative_voted)return false;
    return true;
  });
}
