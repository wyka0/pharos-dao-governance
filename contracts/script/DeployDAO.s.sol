pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GovernanceToken.sol";
import "../src/PharosGovernor.sol";

contract DeployDAO is Script {
    string public constant DAO_NAME = "Pharos Demo DAO";
    uint48 public constant VOTING_DELAY = 1;
    uint32 public constant VOTING_PERIOD = 7200;
    uint256 public constant PROPOSAL_THRESHOLD = 100_000e18;
    uint256 public constant QUORUM = 40_000_000e18; // 4% of 1B supply

    struct DeployedDAO {
        GovernanceToken token;
        PharosGovernor governor;
    }

    function run() external returns (DeployedDAO memory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        console.log("Step 1/2: Deploying GovernanceToken...");
        GovernanceToken token = new GovernanceToken();
        console.log("  Token:", address(token));

        console.log("Step 2/2: Deploying PharosGovernor...");
        PharosGovernor governor = new PharosGovernor(
            IVotes(address(token)),
            DAO_NAME,
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM
        );
        console.log("  Governor:", address(governor));

        console.log("  Delegating deployer tokens to self...");
        token.delegate(deployer);

        vm.stopBroadcast();

        console.log("--- DAO Deployment Complete ---");
        console.log("Token:    ", address(token));
        console.log("Governor: ", address(governor));
        console.log("Deployer: ", deployer);

        return DeployedDAO({ token: token, governor: governor });
    }
}
