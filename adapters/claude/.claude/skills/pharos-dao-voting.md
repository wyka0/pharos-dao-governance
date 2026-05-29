---
name: pharos-dao-governance
description: Full lifecycle DAO governance for Pharos. Create, vote, delegate, activity feed, health check, AI assessment. Supports any OZ Governor contract.
---

# Pharos DAO Governance Skill (Claude Code)

## Setup
```bash
cd /path/to/pharos-dao-governance-skill
npm install
export PRIVATE_KEY=0x...
export GOVERNOR_ADDRESS=0x...
```

## Commands

| Phase | Action | Command |
|-------|--------|---------|
| 🆕 Create | Create proposal | `node scripts/create_proposal.js $GOVERNOR_ADDRESS 0xTarget 0.01 "" "Demo"` |
| 📋 List | List proposals | `node scripts/get_proposals.js $GOVERNOR_ADDRESS` |
| 📄 Details | View proposal 0 | `node scripts/proposal_details.js $GOVERNOR_ADDRESS 0` |
| 🔋 Power | Check voting power | `node scripts/get_vote_power.js $GOVERNOR_ADDRESS 0xVoter` |
| 🗳️ Dry-run | Estimate vote gas | `node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1 "" --dry-run` |
| 🗳️ Vote | Vote For | `node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1` |
| 🗳️ Vote | Vote with reason | `node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1 atlantic-testnet "Supports"` |
| 🔗 Delegate | Delegate to self | `node scripts/delegate_votes.js $GOVERNOR_ADDRESS $VOTER` |
| 📊 Results | Live tally | `node scripts/get_results.js $GOVERNOR_ADDRESS 0` |
| 📅 Activity | 30-day activity feed | `node scripts/governance_activity.js $GOVERNOR_ADDRESS` |
| 👑 Delegates | Delegate insights | `node scripts/delegate_insights.js $GOVERNOR_ADDRESS` |
| 🚨 Risk | Governance risk report | `node scripts/governance_risk_report.js $GOVERNOR_ADDRESS` |
| 🏛️ Health | DAO health report | `node scripts/governance_health.js $GOVERNOR_ADDRESS` |
| 🤖 Assess | AI assessment | `node scripts/governance_assessment.js $GOVERNOR_ADDRESS 0` |

## AI Assessment Output

Note: This is a data-driven signal, not voting advice.

```
🤖 AI Governance Assessment
Proposal #0 — Upgrade USDC contract
Risk: High (Contract Upgrade)
Quorum Progress: 87%
AI Assessment: FOR (confidence: Medium · 65/100)
(This is an automated data analysis, not financial or governance advice.)
```

## Health Score (transparent formula)

`(participation × 0.25) + (quorum_success × 0.25) + (proposal_success × 0.20) + (voter_turnout × 0.30)`

## Activity Feed Output

```
📅 Governance Activity — Last 30 Days
Proposals Created:  8
✅ Passed:   6  |  ❌ Failed:  1  |  🗳️ Active:  1
Pass Rate: 85.7%
Most Active Proposer: 0x1234...abcd (3 proposals)
```
