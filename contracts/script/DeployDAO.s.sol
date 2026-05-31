pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GovernanceToken.sol";
import "../src/PharosGovernor.sol";

contract DeployDAO is Script {
    string public constant DAO_NAME = "Pharos Demo DAO";
    uint48 public constant VOTING_DELAY = 1;
    uint32 public constant VOTING_PERIOD = 7200;
    uint256 public constant PROPOSAL_THRESHOLD = 100_000e18;
    uint256 public constant QUORUM = 40_000_000e18;
    uint256 public constant TIMELOCK_MIN_DELAY = 172800; // 2 days

    struct DeployedDAO {
        GovernanceToken token;
        TimelockController timelock;
        PharosGovernor governor;
    }

    function run() external returns (DeployedDAO memory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        console.log("Step 1/3: Deploying GovernanceToken...");
        GovernanceToken token = new GovernanceToken();
        console.log("  Token:", address(token));

        console.log("Step 2/3: Deploying TimelockController...");
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        TimelockController timelock = new TimelockController(
            TIMELOCK_MIN_DELAY,
            proposers,
            executors,
            deployer
        );
        console.log("  Timelock:", address(timelock));

        console.log("Step 3/3: Deploying PharosGovernor...");
        PharosGovernor governor = new PharosGovernor(
            IVotes(address(token)),
            timelock,
            DAO_NAME,
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM
        );
        console.log("  Governor:", address(governor));

        console.log("  Granting roles on TimelockController...");
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.revokeRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

        console.log("  Delegating deployer tokens to self...");
        token.delegate(deployer);

        vm.stopBroadcast();

        console.log("--- DAO Deployment Complete ---");
        console.log("Token:    ", address(token));
        console.log("Timelock: ", address(timelock));
        console.log("Governor: ", address(governor));
        console.log("Deployer: ", deployer);

        return DeployedDAO({ token: token, timelock: timelock, governor: governor });
    }
}
