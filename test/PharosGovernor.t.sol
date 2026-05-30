pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/src/GovernanceToken.sol";
import "../contracts/src/PharosGovernor.sol";

contract PharosGovernorTest is Test {
    GovernanceToken token;
    PharosGovernor governor;

    function setUp() public {
        token = new GovernanceToken();
        governor = new PharosGovernor(
            IVotes(address(token)),
            "PharosGovernor",
            1,       // votingDelay
            7200,    // votingPeriod
            100_000e18, // proposalThreshold
            40_000_000e18 // quorum
        );
    }

    function test_tokenMinted() public view {
        assertEq(token.balanceOf(address(this)), 1_000_000_000e18);
    }

    function test_governorName() public view {
        assertEq(governor.name(), "PharosGovernor");
    }

    function test_votingDelay() public view {
        assertGt(governor.votingDelay(), 0);
    }

    function test_votingPeriod() public view {
        assertGt(governor.votingPeriod(), 0);
    }

    function test_quorumNumerator() public view {
        assertGe(governor.quorum(0), 1);
    }

    function test_proposalThreshold() public view {
        assertGe(governor.proposalThreshold(), 0);
    }
}
