// Both selections are independent and intersect, rather than replacing one another.
export function filterTrackerBills(bills,myVote='all',repVote='all'){
  return bills.filter(bill=>{
    if(myVote==='voted'&&!bill.user_voted)return false;
    if(myVote==='not-voted'&&bill.user_voted)return false;
    if(repVote==='voted'&&!bill.representative_voted)return false;
    if(repVote==='not-voted'&&bill.representative_voted)return false;
    return true;
  });
}
