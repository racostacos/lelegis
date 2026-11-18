Run from the root of ~/lelegis after extracting this ZIP:

zsh patch/apply-bill-status-fix.sh

Then rerun:

npm run sync:bills -- --dry-run --type=HB

Expected HB count: 1259.
The sample status for HB1 should be exactly:
Signed by the Governor - Act 3
