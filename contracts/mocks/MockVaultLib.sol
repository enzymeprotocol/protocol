// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../persistent/vault/VaultLibBaseCore.sol";

/// @title MockVaultLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mock VaultLib implementation that only extends VaultLibBaseCore
contract MockVaultLib is VaultLibBaseCore {
    function getAccessor() external view returns (address) {
        return accessor;
    }

    function getCreator() external view returns (address) {
        return creator;
    }

    function getMigrator() external view returns (address) {
        return migrator;
    }

    function getOwner() external view returns (address) {
        return owner;
    }

    function getIsLib() external view returns (bool) {
        return isLib;
    }
}