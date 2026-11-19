// Filter the tracker, not the underlying legislative record. Keep uncertain
// records visible rather than assuming that a subject label implies no action.
export function isCeremonialResolution(bill){
  if(!/^(?:HR|SR|HCR|SCR)\d+$/i.test(String(bill.instrument??'')))return false;
  const subject=String(bill.subject??'').trim().replace(/^[IVXLCDM]+\s+/i,'').toUpperCase();
  if(!['COMMENDATIONS','CONDOLENCES'].includes(subject))return false;
  const description=String(bill.official_description??'').trim();
  if(!description)return false;

  // A legislative request, requirement, program, expenditure, or similar
  // operative provision takes precedence over a ceremonial subject label.
  const actionText=description.replace(/\bresponse to [^.;]*?'s request for proposals\b/gi,'response to a solicitation');
  if(/\b(?:requests?|directs?|requires?|mandates?|authorizes?|appropriates?|allocates?|funds?|establishes?|creates?|amends?|repeals?|enacts?|prohibits?|suspends?|implements?|adopts?|orders?|instructs?|urges?|calls? (?:on|upon|for)|recommends?|proposes?|renames?|provides?|commissions?|assigns?|appoints?|exempts?|issues?)\b/i.test(actionText))return false;
  // Observing a commemorative date is symbolic; other encouragement or
  // designations may have practical consequences and remain visible.
  if(/\bencourages?\s/i.test(description)&&!/\bencourages? (?:the )?observance\b/i.test(description))return false;
  if(/\bdesignates?\b/i.test(description)&&!/\bdesignates?\b[^;.!?]*\bas\b[^;.!?]*\b(?:day|week|month|anniversary)\b/i.test(description)&&!/^designates?\s+[^;.!?]+\s+as\s+the\s+[^;.!?]+\s+capital of Louisiana\.?$/i.test(description))return false;

  if(/\bproclaims?\b/i.test(description)&&!/\bproclaims?\b[^;.!?]*\bas\b[^;.!?]*\b(?:day|week|month|anniversary)\b/i.test(description))return false;
  return /^(?:to\s+)?(?:commends?|commending|congratulates?|recognizes?|honors?|commemorates?|commemorating|celebrates?|express(?:es)?|extends?|designates?|proclaims?)\b/i.test(description);
}
