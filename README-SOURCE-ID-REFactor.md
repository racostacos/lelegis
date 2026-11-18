# LeLegis Louisiana source-ID + floor roll-call layer

This package intentionally leaves the working bill-action parser alone.

## Stage A
- Adds `legislators.source_member_id`
- Backfills `bills.official_bill_id`
- Uses canonical `BillInfo.aspx?i=...`
- Resolves primary bill author by exact Louisiana profile ID

## Stage B
- Parses official Louisiana floor roll-call PDFs
- Populates `legislator_votes`
- Refuses ambiguous name matches rather than guessing
- Leaves office-title aliases (`Mr. Speaker`, `Mr. President`) unresolved for a later explicit office-holder mapping layer
