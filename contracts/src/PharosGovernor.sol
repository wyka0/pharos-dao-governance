pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";

contract PharosGovernor is
    Governor,
    GovernorCountingSimple,
    GovernorVotes
{
    uint48 private _votingDelaySetting;
    uint32 private _votingPeriodSetting;
    uint256 private _proposalThresholdSetting;
    uint256 private _quorumSetting;

    constructor(
        IVotes _token,
        string memory _name,
        uint48 _votingDelay,
        uint32 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorum
    )
        Governor(_name)
        GovernorVotes(_token)
    {
        _votingDelaySetting = _votingDelay;
        _votingPeriodSetting = _votingPeriod;
        _proposalThresholdSetting = _proposalThreshold;
        _quorumSetting = _quorum;
    }

    function votingDelay() public view override returns (uint256) {
        return _votingDelaySetting;
    }

    function votingPeriod() public view override returns (uint256) {
        return _votingPeriodSetting;
    }

    function proposalThreshold() public view override returns (uint256) {
        return _proposalThresholdSetting;
    }

    function quorum(uint256) public view override returns (uint256) {
        return _quorumSetting;
    }
}
