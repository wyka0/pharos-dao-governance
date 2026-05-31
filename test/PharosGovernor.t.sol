pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/src/GovernanceToken.sol";
import "../contracts/src/PharosGovernor.sol";

contract PharosGovernorTest is Test {
    GovernanceToken token;
    TimelockController timelock;
    PharosGovernor governor;

    function setUp() public {
        token = new GovernanceToken();

        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        timelock = new TimelockController(0, proposers, executors, address(this));

        governor = new PharosGovernor(
            IVotes(address(token)),
            timelock,
            "PharosGovernor",
            1,           // votingDelay
            7200,        // votingPeriod
            100_000e18,  // proposalThreshold
            40_000_000e18 // quorum
        );

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.revokeRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));
    }

    function test_tokenMinted() public view {
        assertEq(token.balanceOf(address(this)), 1_000_000_000e18);
    }

    function test_governorName() public view {
        assertEq(governor.name(), "PharosGovernor");
    }

    function test_votingDelay() public view {
        assertEq(governor.votingDelay(), 1);
    }

    function test_votingPeriod() public view {
        assertEq(governor.votingPeriod(), 7200);
    }

    function test_proposalThreshold() public view {
        assertEq(governor.proposalThreshold(), 100_000e18);
    }

    function test_quorum() public view {
        assertEq(governor.quorum(0), 40_000_000e18);
    }

    function test_totalSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000e18);
    }

    function test_tokenNameSymbol() public view {
        assertEq(token.name(), "Pharos DAO Token");
        assertEq(token.symbol(), "pDAO");
    }

    function test_governorToken() public view {
        assertEq(address(governor.token()), address(token));
    }

    function _delegateAndAdvance() internal {
        token.delegate(address(this));
        vm.roll(block.number + 1);
    }

    function test_createProposal() public {
        _delegateAndAdvance();

        address[] memory targets = new address[](1);
        targets[0] = address(this);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("testProposal()");

        uint256 proposalId = governor.propose(targets, values, calldatas, "Test proposal");
        assertTrue(proposalId != 0);
    }

    function test_proposalStateAfterCreate() public {
        _delegateAndAdvance();

        address[] memory targets = new address[](1);
        targets[0] = address(this);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = hex"00";

        uint256 proposalId = governor.propose(targets, values, calldatas, "State test");
        assertEq(uint8(governor.state(proposalId)), uint8(IGovernor.ProposalState.Pending));
    }

    function test_delegationGrantsVotingPower() public {
        assertEq(token.getVotes(address(this)), 0);
        token.delegate(address(this));
        assertEq(token.getVotes(address(this)), 1_000_000_000e18);
    }

    function test_proposalFailsWithoutDelegation() public {
        address[] memory targets = new address[](1);
        targets[0] = address(this);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = hex"00";

        vm.expectRevert();
        governor.propose(targets, values, calldatas, "Should fail");
    }

    function test_proposalThresholdCheck() public {
        _delegateAndAdvance();
        assertGe(token.getVotes(address(this)), governor.proposalThreshold());
    }

    function test_quorumRequirement() public {
        _delegateAndAdvance();
        assertGe(token.getVotes(address(this)), governor.quorum(block.number));
    }

    function test_governorVersion() public view {
        assertEq(governor.version(), "1");
    }

    function test_timelockAddress() public view {
        assertEq(governor.timelock(), address(timelock));
    }

    function test_proposalNeedsQueuing() public view {
        assertTrue(governor.proposalNeedsQueuing(0));
    }
}
