# OpenCode integration for pharos-dao-governance skill

```yaml
name: pharos-dao-governance
description: |
  Full lifecycle DAO governance for Pharos. Create → Vote → Delegate → Analyze.
  - Create proposals (auto-checks threshold)
  - List proposals (Bravo + OZ Governor auto-detect)
  - Voting power & delegation checks
  - Cast votes with --dry-run safety mode
  - Governance activity feed (30-day window, pass rate, top proposer)
  - Delegate insights (top delegates, concentration HHI, Nakamoto coefficient)
  - Governance risk report (composite risk score across 6 dimensions)
  - DAO health score report (transparent formula)
  - AI governance assessment (data-driven signal, not advice)

commands:
  - node scripts/create_proposal.js <governor> <target> [value] [calldata] [description] [network]
  - node scripts/get_proposals.js <governor_address> [network] [limit]
  - node scripts/proposal_details.js <governor_address> <proposal_id> [network]
  - node scripts/get_vote_power.js <governor_address> <voter_address> [network]
  - node scripts/cast_vote.js <governor_address> <proposal_id> <0|1|2> [network] [reason] [--dry-run]
  - node scripts/delegate_votes.js <governor_address> <delegate_address> [network]
  - node scripts/get_results.js <governor_address> <proposal_id> [network]
  - node scripts/governance_activity.js <governor_address> [network] [days]
  - node scripts/delegate_insights.js <governor_address> [network]
  - node scripts/governance_risk_report.js <governor_address> [network]
  - node scripts/governance_health.js <governor_address> [network]
  - node scripts/governance_assessment.js <governor_address> <proposal_id> [network]

env:
  PRIVATE_KEY: required for write operations (create, vote, delegate)
  RPC_URL: optional RPC override
```
