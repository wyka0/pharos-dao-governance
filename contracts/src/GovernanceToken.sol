pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

contract GovernanceToken is ERC20Permit, ERC20Votes {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000e18; // 1 billion

    constructor() ERC20("Pharos DAO Token", "pDAO") ERC20Permit("Pharos DAO Token") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    function _update(address from, address to, uint256 amount)
        internal override(ERC20, ERC20Votes)
    {
        super._update(from, to, amount);
    }

    function nonces(address owner)
        public view override(ERC20Permit, Nonces) returns (uint256)
    {
        return super.nonces(owner);
    }
}
