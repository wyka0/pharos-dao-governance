---
name: pharos-dao-governance
description: >
  Full lifecycle DAO governance for Pharos Agent Center: create proposals, vote with dry-run safety, delegate power, assess DAO health, and get AI governance recommendations. Compatible with any OpenZeppelin Governor-compatible DAO.
version: 3.0.0
requires:
  bins:
  - node
  pkgs:
  - ethers
---

# Pharos DAO Governance Skill

Complete on-chain governance interface for Pharos. Spans the full lifecycle: **create → vote → delegate → analyze → recommend**.

## Capabilities

| Phase | Script | Methods |
|-------|--------|---------|
| 🆕 Create Proposal | `scripts/create_proposal.js` | `proposalThreshold()` → `getVotes()` → `propose()` |
| 📋 List Proposals | `scripts/get_proposals.js` | `proposalCount()` or `ProposalCreated` events + `proposals()` + `state()` |
| 📄 Proposal Details | `scripts/proposal_details.js` | `proposals()` + `state()` + `proposalVotes()` |
| 🔋 Voting Power | `scripts/get_vote_power.js` | `token()` → `getVotes()` + `delegates()` + `hasVoted()` |
| 🗳️ Cast Vote | `scripts/cast_vote.js` | `--dry-run` safety + `state()` + `hasVoted()` + `castVote()` / `castVoteWithReason()` |
| 🔗 Delegate | `scripts/delegate_votes.js` | `delegates()` + `delegate()` |
| 📊 Vote Results | `scripts/get_results.js` | `proposalVotes()` + `quorum()` + block countdown |
| 🏛️ DAO Health | `scripts/governance_health.js` | Composite score: participation, quorum success, proposal success, voter turnout |
| 📅 Activity Feed | `scripts/governance_activity.js` | Time-bound governance summary: proposals, pass rate, most active proposer |
| 👑 Delegate Insights | `scripts/delegate_insights.js` | Top delegates, governance concentration (HHI), Nakamoto coefficient |
| 🚨 Risk Report | `scripts/governance_risk_report.js` | Composite risk score: centralization, participation, quorum, delegate diversity, proposal health |
| 🤖 AI Assessment | `scripts/governance_assessment.js` | Risk analysis + quorum probability + vote margin → data-driven FOR/AGAINST/REVIEW signal + 🚨 quorum alert when < 1000 blocks remain |

## Quickstart

```bash
npm install
cp .env.example .env   # Add PRIVATE_KEY + GOVERNOR_ADDRESS

# 1. Create a proposal
node scripts/create_proposal.js $GOVERNOR_ADDRESS 0xRecipient 0.01 "" "Demo: Allocate 0.01 PHRS"

# 2. Check your voting power
node scripts/get_vote_power.js $GOVERNOR_ADDRESS $(node -e "console.log(require('./scripts/pharos_rpc').getWallet().address)")

# 3. Dry-run vote first
node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1 atlantic-testnet "" --dry-run

# 4. Vote
node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1

# 5. Governance activity feed (last 30 days)
node scripts/governance_activity.js $GOVERNOR_ADDRESS

# 6. Delegate concentration analysis
node scripts/delegate_insights.js $GOVERNOR_ADDRESS

# 7. Get AI assessment (data-driven, not advice)
node scripts/governance_assessment.js $GOVERNOR_ADDRESS 0

# 8. DAO health report
node scripts/governance_health.js $GOVERNOR_ADDRESS
```

## Trigger Phrases

"create proposal" · "new proposal" · "show active proposals" · "what's up for vote" · "explain proposal" · "summarize proposal" · "check my voting power" · "vote yes on proposal 3" · "vote against" · "abstain" · "delegate my votes to" · "how did the vote go" · "did proposal pass" · "what's the quorum" · "has voting closed" · "who voted" · "show governance activity" · "dao health" · "governance report" · "analyze proposal" · "ai assessment" · "what does the data say" · "top delegates" · "who holds the most power" · "governance concentration" · "delegate insights" · "nakamoto coefficient" · "governance risk" · "is the dao healthy" · "risk report" · "is quorum at risk" · "quorum alert" · "alert me" · "check quorum" · "proposals at risk" · "scan for quorum failures"

## Compatibility

| Governor Variant | Status |
|-----------------|--------|
| OZ Governor v4+ | ✅ proposals(), state(), proposalVotes(), hasVoted(), castVote() |
| OZ GovernorVotes | ✅ + token(), getVotes() |
| OZ GovernorVotesQuorumFraction | ✅ + quorum() |
| GovernorBravo | ✅ proposalCount() path |
| Custom Governor | ✅ Falls back to ProposalCreated events |
