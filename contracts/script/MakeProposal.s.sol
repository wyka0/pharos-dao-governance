pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PharosGovernor.sol";

contract MakeProposal is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address governorAddr = vm.envAddress("GOVERNOR_ADDRESS");

        vm.startBroadcast(deployerKey);

        PharosGovernor governor = PharosGovernor(payable(governorAddr));

        address self = vm.addr(deployerKey);
        address[] memory targets = new address[](1);
        targets[0] = self;

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = hex"00";

        string memory description = "Demo Proposal: Allocate 0.01 PHRS for community event";

        console.log("Creating proposal...");
        console.log("  Target:", targets[0]);

        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        console.log("Proposal Created!");
        console.log("  Proposal ID:"); console.logUint(proposalId);
        console.log("  Governor:", governorAddr);

        vm.stopBroadcast();
    }
}
