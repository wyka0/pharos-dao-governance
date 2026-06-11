pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";

contract PharosGovernor is
    Governor,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorSettings
{
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
        GovernorSettings(_votingDelay, _votingPeriod, _proposalThreshold)
    {
        _quorumSetting = _quorum;
    }

    function quorum(uint256) public view override returns (uint256) {
        return _quorumSetting;
    }

    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }
}
