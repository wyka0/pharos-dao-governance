# Proposal State Machine (OpenZeppelin Governor)

## State Transition Flow

```
                    ┌──────────┐
                    │ Pending  │  ← Proposal created, delay before voting
                    └────┬─────┘
                         │ votingDelay passes
                         ▼
                    ┌──────────┐
             ┌──────│  Active  │  ← Voting is open
             │      └────┬─────┘
             │           │ votingPeriod ends
             │           ▼
             │    ┌──────────────┐
             │    │  Defeated    │  ← forVotes < quorum OR forVotes ≤ againstVotes
             │    └──────────────┘
             │
             │           ▼
             │    ┌──────────────┐
             │    │  Succeeded   │  ← forVotes ≥ quorum AND forVotes > againstVotes
             │    └──────┬───────┘
             │           │ queue()
             │           ▼
             │    ┌──────────────┐
             │    │   Queued     │  ← Awaiting timelock delay
             │    └──────┬───────┘
             │           │ execute()
             │           ▼
             │    ┌──────────────┐
             │    │  Executed    │  ← Proposal executed on-chain
             │    └──────────────┘
             │
             │    ┌──────────────┐
             └───→│  Canceled    │  ← Canceled by proposer or guardian
                  └──────────────┘

                  ┌──────────────┐
                  │   Expired    │  ← Queued but not executed before deadline
                  └──────────────┘
```

## State Table

| Value | Name | Description | Can Vote? | Can Execute? |
|-------|------|-------------|-----------|--------------|
| 0 | Pending | Proposal created, waiting for voting delay | No | No |
| 1 | Active | Voting is open | Yes | No |
| 2 | Canceled | Canceled by proposer/guardian | No | No |
| 3 | Defeated | Failed: didn't meet quorum or outvoted | No | No |
| 4 | Succeeded | Passed: met quorum and forVotes > againstVotes | No | No |
| 5 | Queued | Awaiting timelock execution | No | No |
| 6 | Expired | Queued past execution window | No | No |
| 7 | Executed | Successfully executed on-chain | No | N/A |

## Vote Values

| Value | Vote |
|-------|------|
| 0 | Against |
| 1 | For |
| 2 | Abstain |

## Common Governor Parameters

| Parameter | Description | Typical Value |
|-----------|-------------|---------------|
| votingDelay | Blocks before voting starts | 1 block |
| votingPeriod | Blocks voting is open | 7,200 (1 day) |
| proposalThreshold | Min voting power to propose | 1% of supply |
| quorum | Min forVotes to pass | 4% of supply |
