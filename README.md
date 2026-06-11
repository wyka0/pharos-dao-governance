# Pharos DAO Governance Skill

Full lifecycle DAO governance for Pharos. **Create → Vote → Delegate → Analyze → Get AI Recommendations**. Works with any OpenZeppelin Governor-compatible DAO.

## Features

| Phase | Script | What It Does |
|-------|--------|--------------|
| 🆕 **Create** | `create_proposal.js` | Pre-checks threshold, submits `propose()`, returns proposal ID |
| 📋 **List** | `get_proposals.js` | Auto-detects Governor style — `proposalCount()` (Bravo) or `ProposalCreated` events (OZ) |
| 📄 **Details** | `proposal_details.js` | Full breakdown: votes, quorum, state, proposer, timeline |
| 🔋 **Voting Power** | `get_vote_power.js` | `getVotes()` + delegation status + active proposals |
| 🗳️ **Vote** | `cast_vote.js` | **`--dry-run` mode** — estimate gas, no tx sent. Supports `castVoteWithReason()` |
| 🔗 **Delegate** | `delegate_votes.js` | Auto-discovers token via `token()`, checks current delegate |
| 📊 **Results** | `get_results.js` | Live tally + quorum progress + block countdown |
| 📅 **Activity** | `governance_activity.js` | Time-bound activity feed — proposals created, pass rate, most active proposer |
| 👑 **Delegates** | `delegate_insights.js` | Top delegates, governance concentration (HHI), Nakamoto coefficient |
| 🚨 **Risk Report** | `governance_risk_report.js` | Composite risk score: centralization, participation, quorum, delegate diversity, proposal health |
| 🏛️ **Health** | `governance_health.js` | Composite health score from participation, quorum success, proposal success, voter turnout |
| 🤖 **AI Assessment** | `governance_assessment.js` | Risk analysis + quorum probability + vote margin → data-driven FOR/AGAINST/REVIEW signal |

## Quickstart

```bash
git clone --recursive https://github.com/wyka0/pharos-dao-governance.git
cd pharos-dao-governance
npm install
forge test
npm test
cp .env.example .env
```

Required in `.env`:
```
PRIVATE_KEY=0x...
GOVERNOR_ADDRESS=0x...
```

```bash
# Create a proposal
node scripts/create_proposal.js $GOVERNOR_ADDRESS 0xRecipient 0.01 "" "Demo proposal"

# List proposals
node scripts/get_proposals.js $GOVERNOR_ADDRESS

# View proposal details
node scripts/proposal_details.js $GOVERNOR_ADDRESS 0

# Check voting power
node scripts/get_vote_power.js $GOVERNOR_ADDRESS 0xVoterAddress

# Dry-run vote (no tx)
node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1 atlantic-testnet "" --dry-run

# Vote For on proposal 0
node scripts/cast_vote.js $GOVERNOR_ADDRESS 0 1

# Delegate to self
node scripts/delegate_votes.js $GOVERNOR_ADDRESS 0xYourAddress

# Live results
node scripts/get_results.js $GOVERNOR_ADDRESS 0

# DAO health report
node scripts/governance_health.js $GOVERNOR_ADDRESS

# Governance activity feed (last 30 days)
node scripts/governance_activity.js $GOVERNOR_ADDRESS

# Delegate concentration analysis 👑
node scripts/delegate_insights.js $GOVERNOR_ADDRESS
```

## Sample Output

### `governance_health.js` — DAO Health Score
```
🏛  DAO Governance Health Report
Network: atlantic-testnet
Governor: 0x7Ab900B0...c4EA70

  OVERALL HEALTH: 47/100
  █████████░░░░░░░░░░░ ❌ Needs improvement

📊 Metrics
  Total Proposals: 3
  Active: 3  |  Executed: 0  |  Succeeded: 0
  Defeated: 0  |  Canceled: 0

📈 Rates
  Participation:       33.3%  ███████░░░░░░░░░░░░░
  Quorum Success:      33.3%  ███████░░░░░░░░░░░░░
  Proposal Success:     0.0%  ░░░░░░░░░░░░░░░░░░░░
  Voter Participation:100.0%  ████████████████████
```

### `governance_assessment.js` — AI Assessment (Quorum Alert)
```
🤖 AI Governance Recommendation
Proposal #48630...64515
State: Active

📊 Vote Analysis
  ✅ For:     1,000,000,000 pDAO  ███████████████ 100.0%
  ❌ Against:              0      ░░░░░░░░░░░░░░░   0.0%

🎯 Quorum
  Required:      40,000,000 pDAO
  Progress:            100.0%  ✅ Met

🔮 AI Assessment: FOR  (confidence: High · 85/100)
🚨 QUORUM ALERT — Proposal may fail if quorum not met soon!

📋 Reasoning
  • On-chain sentiment shows 100% in favor
  • ✅ Quorum met. For votes lead by 960M.
  • ⏳ 637 blocks remain in voting window.
```

### `governance_risk_report.js` — Composite Risk Score
```
🚨 Governance Risk Report

  Risk Score: 30/100
  ██████░░░░░░░░░░░░░░ 🟢 Low

📋 Findings (3)
  🟠 [Quorum Risk] Quorum reached in only 33.3%
  🟡 [Data Gap] Could not analyze delegate concentration
  🟢 [Participation] Voter participation stable
```

## Deploy a Demo DAO on Pharos Testnet

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install foundry-rs/forge-std --no-git

export PRIVATE_KEY=0x...

# Deploy: GovernanceToken → PharosGovernor
forge script script/DeployDAO.s.sol --rpc-url atlantic-testnet --broadcast
```

Output:
```
=== DAO Deployment Complete ===
Token:      0x...
Governor:   0x...    ← set as GOVERNOR_ADDRESS
```

Then create a proposal and test every script against it.

### ⚠️ Contract Size Limit (Atlantic Testnet)

The Pharos Atlantic chain enforces the standard 24KB EIP-170 contract size limit.
If deployment fails with `contract code size exceeds 24576 bytes`:

- **Option A:** Increase `optimizer_runs` in `contracts/foundry.toml` (e.g. `100000`) to reduce bytecode via aggressive optimization.
- **Option B:** Use the simplified Governor at `contracts/src/PharosGovernor.sol` (no `GovernorTimelockControl`), which is already the default in the repo.

The timelock-free Governor is ~23.5KB, fitting comfortably under the limit.

## Governor Compatibility

| Variant | Support | Approach |
|---------|---------|----------|
| **OZ Governor v5+** | ✅ Full | `proposalSnapshot()`, `proposalDeadline()`, `proposalProposer()` + `state()` + `proposalVotes()` |
| **OZ Governor v4** | ✅ Full | `proposals()`, `state()`, `proposalVotes()`, `hasVoted()`, `castVote()` |
| **OZ GovernorVotes** | ✅ Full | + `token()`, `getVotes()` |
| **GovernorBravo** | ✅ Full | `proposalCount()` + `proposals()` — **auto-detected first** |
| **Custom Governor** | ⚠️ Best-effort | Falls back to `ProposalCreated` event scanning |

**Note:** OZ v5 removed the public `proposals()` getter (returns `ProposalCore` via private mapping). The skill auto-detects the variant and uses the correct API.

## Health Score Formula (Transparent)

`governance_health.js` composite score calculation:

| Metric | Weight | Source |
|--------|--------|--------|
| Participation Rate | 25% | % of proposals that received at least 1 vote |
| Quorum Success Rate | 25% | % of proposals that met quorum |
| Proposal Success Rate | 20% | % of completed proposals that passed |
| Voter Turnout | 30% | Total votes cast / total token supply |

Formula: `(participation × 0.25) + (quorum_success × 0.25) + (proposal_success × 0.20) + (voter_turnout × 0.30)`

All values are clamped 0–100. Higher is better, but context matters — a new DAO will naturally score lower than a mature one.

## AI Assessment — What It Is and Isn't

`governance_assessment.js` outputs a **data-driven signal**, not advice.

**What it does:**
- Reads on-chain vote data (for/against/abstain)
- Computes quorum probability, vote margin, participation rate
- Categorizes risk from proposal description keywords
- Outputs FOR / AGAINST / REVIEW with a confidence score

**What it doesn't do:**
- It does NOT tell you how to vote
- It does NOT factor off-chain discussion, personal values, or hidden context
- Governance is subjective. The tool assists — it does not dictate.

## Complete Feature Matrix

| Feature | Typical DAO Tool | This Project |
|---------|-----------------|--------------|
| Proposals | ✅ | ✅ |
| Voting | ✅ | ✅ |
| Delegation | ✅ | ✅ |
| Create Proposal | ❌ | ✅ |
| Health Score | ❌ | ✅ |
| Activity Feed | ❌ | ✅ |
| Delegate Analysis | ❌ | ✅ |
| Nakamoto Coefficient | ❌ | ✅ |
| HHI Concentration | ❌ | ✅ |
| Risk Report | ❌ | ✅ |
| AI Assessment | ❌ | ✅ |
| Quorum Alert | ❌ | ✅ |

## Key Differentiators

1. **Governance Risk Report** — `governance_risk_report.js` composites data from health + activity + delegate insights into a single risk score with categorized findings across 6 dimensions.
2. **AI Governance Assessment** — `governance_assessment.js` reads live vote data, computes quorum probability, risk-categorizes the proposal, and outputs FOR / AGAINST / REVIEW with structured reasoning and a disclaimer. Moves from "voting tool" to "AI governance assistant" without overclaiming.
3. **Quorum Alert** — If an active proposal closes within 1,000 blocks without meeting quorum, the assessment emits a 🚨 QUORUM ALERT. A standalone `quorumAlertCheck()` scans all active proposals.
4. **Governance Activity Feed** — `governance_activity.js` shows a 30-day window of DAO activity: proposals created, passed, failed, most active proposer, pass rate.
5. **Delegate Insights** — `delegate_insights.js` reveals power distribution: top delegates with voting power %, normalized HHI concentration score, and Nakamoto coefficient (delegates needed to reach 51%).
6. **DAO Health Score** — `governance_health.js` computes a composite 0–100 health score with transparent formula (25/25/20/30 weighting) and visual bar charts.
7. **Safety-first design** — every `cast_vote.js` has `--dry-run` mode, `state()` pre-check, `hasVoted()` pre-check.
8. **Governor-agnostic** — no hardcoded contract assumptions. Auto-detects OZ v4, OZ v5, and GovernorBravo. Falls back gracefully.

## Demo Checklist

```bash
# 1. Deploy demo DAO to Pharos testnet
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge script script/DeployDAO.s.sol --rpc-url atlantic-testnet --broadcast
# → Governor address printed. Export as $GOV

# 2. Create 2-3 proposals
node scripts/create_proposal.js $GOV $GOV 0 "" "First proposal"
node scripts/create_proposal.js $GOV $GOV 0 "" "Treasury Multi-Sig"
node scripts/create_proposal.js $GOV $GOV 0 "" "Reduce Proposal Threshold"

# 3. List all proposals
node scripts/get_proposals.js $GOV

# 4. Check voting power & delegate
node scripts/get_vote_power.js $GOV
node scripts/delegate_votes.js $GOV <your_address>

# 5. Cast votes with reasoning
node scripts/cast_vote.js $GOV 0 1 "Best path for the DAO" --dry-run
node scripts/cast_vote.js $GOV 0 1 "Best path for the DAO"

# 6. Results & quorum
node scripts/get_results.js $GOV 0

# 7. Generate all 5 analytics
node scripts/governance_activity.js $GOV
node scripts/governance_health.js $GOV
node scripts/delegate_insights.js $GOV
node scripts/governance_risk_report.js $GOV        # ← demo highlight
node scripts/governance_assessment.js $GOV 0

# 8. Or use npm shortcuts
npm run proposals -- $GOV
npm run details -- $GOV 0
npm run power -- $GOV <voter>
npm run vote -- $GOV 0 1 --dry-run
npm run delegate -- $GOV <address>
npm run results -- $GOV 0
npm run health -- $GOV
npm run activity -- $GOV
npm run delegates -- $GOV
npm run risk -- $GOV
npm run assessment -- $GOV 0
npm run create -- $GOV $GOV 0 "" "Proposal"
```
