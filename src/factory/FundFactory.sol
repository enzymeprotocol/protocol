pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../fund/fees/IFeeManager.sol";
import "../fund/hub/Hub.sol";
import "../fund/policies/IPolicyManager.sol";
import "../fund/shares/IShares.sol";
import "../fund/vault/IVault.sol";
import "../engine/AmguConsumer.sol";
import "../registry/IRegistry.sol";
import "./Factory.sol";
import "./IFundFactory.sol";

/// @title FundFactory Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Creates fund routes and links them together
contract FundFactory is IFundFactory, AmguConsumer, Factory, DSAuth {

    event NewFund(
        address indexed manager,
        address indexed hub,
        address[6] routes
    );

    IFeeManagerFactory public feeManagerFactory;
    IPolicyManagerFactory public policyManagerFactory;
    ISharesFactory public sharesFactory;
    IVaultFactory public vaultFactory;

    address[] public funds;
    mapping (address => address) public managersToHubs;
    mapping (address => Hub.Routes) public managersToRoutes;
    mapping (address => Settings) public managersToSettings;

    /// @dev Parameters stored when beginning setup
    struct Settings {
        string name;
        address[] exchanges;
        address[] adapters;
        address denominationAsset;
        address[] defaultInvestmentAssets;
        address[] fees;
        uint256[] feeRates;
        uint256[] feePeriods;
    }

    constructor(
        address _feeManagerFactory,
        address _sharesFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _registry,
        address _postDeployOwner
    )
        AmguConsumer(_registry)
        public
    {
        setOwner(_postDeployOwner);
        feeManagerFactory = IFeeManagerFactory(_feeManagerFactory);
        sharesFactory = ISharesFactory(_sharesFactory);
        vaultFactory = IVaultFactory(_vaultFactory);
        policyManagerFactory = IPolicyManagerFactory(_policyManagerFactory);
    }

    function componentExists(address _component) internal pure returns (bool) {
        return _component != address(0);
    }

    function ensureComponentNotSet(address _component) internal {
        require(
            !componentExists(_component),
            "This step has already been run"
        );
    }

    function ensureComponentSet(address _component) internal {
        require(
            componentExists(_component),
            "Component preprequisites not met"
        );
    }

    function beginSetup(
        string memory _name,
        address[] memory _fees,
        uint256[] memory _feeRates,
        uint256[] memory _feePeriods,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _denominationAsset,
        address[] memory _defaultInvestmentAssets
    )
        public
    {
        ensureComponentNotSet(managersToHubs[msg.sender]);
        REGISTRY.reserveFundName(
            msg.sender,
            _name
        );

        managersToHubs[msg.sender] = address(new Hub(msg.sender, _name));
        managersToSettings[msg.sender] = Settings(
            _name,
            _exchanges,
            _adapters,
            _denominationAsset,
            _defaultInvestmentAssets,
            _fees,
            _feeRates,
            _feePeriods
        );
        managersToRoutes[msg.sender].registry = address(REGISTRY);
        managersToRoutes[msg.sender].fundFactory = address(this);
    }

    function _createFeeManagerFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].feeManager);
        managersToRoutes[_manager].feeManager = feeManagerFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].denominationAsset,
            managersToSettings[_manager].fees,
            managersToSettings[_manager].feeRates,
            managersToSettings[_manager].feePeriods,
            managersToRoutes[_manager].registry
        );
    }

    function createFeeManagerFor(address _manager) external amguPayable payable { _createFeeManagerFor(_manager); }
    function createFeeManager() external amguPayable payable { _createFeeManagerFor(msg.sender); }

    function _createPolicyManagerFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].policyManager);
        managersToRoutes[_manager].policyManager = policyManagerFactory.createInstance(
            managersToHubs[_manager]
        );
    }

    function createPolicyManagerFor(address _manager) external amguPayable payable { _createPolicyManagerFor(_manager); }
    function createPolicyManager() external amguPayable payable { _createPolicyManagerFor(msg.sender); }

    function _createSharesFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].shares);
        managersToRoutes[_manager].shares = sharesFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].denominationAsset,
            managersToSettings[_manager].defaultInvestmentAssets,
            managersToRoutes[_manager].registry
        );
    }

    function createSharesFor(address _manager) external amguPayable payable { _createSharesFor(_manager); }
    function createShares() external amguPayable payable { _createSharesFor(msg.sender); }

    function _createVaultFor(address _manager)
        internal
    {
        ensureComponentSet(managersToHubs[_manager]);
        ensureComponentNotSet(managersToRoutes[_manager].vault);
        managersToRoutes[_manager].vault = vaultFactory.createInstance(
            managersToHubs[_manager],
            managersToSettings[_manager].exchanges,
            managersToSettings[_manager].adapters,
            managersToRoutes[_manager].registry
        );
    }

    function createVaultFor(address _manager) external amguPayable payable { _createVaultFor(_manager); }
    function createVault() external amguPayable payable { _createVaultFor(msg.sender); }

    function _completeSetupFor(address _manager) internal {
        Hub.Routes memory routes = managersToRoutes[_manager];
        Hub hub = Hub(managersToHubs[_manager]);
        require(!childExists[address(hub)], "Setup already complete");
        require(
            componentExists(address(hub)) &&
            componentExists(routes.feeManager) &&
            componentExists(routes.policyManager) &&
            componentExists(routes.shares) &&
            componentExists(routes.vault),
            "Components must be set before completing setup"
        );
        childExists[address(hub)] = true;
        hub.initializeAndSetPermissions([
            routes.feeManager,
            routes.policyManager,
            routes.shares,
            routes.vault,
            routes.registry,
            routes.fundFactory
        ]);
        funds.push(address(hub));
        REGISTRY.registerFund(
            address(hub),
            _manager,
            managersToSettings[_manager].name
        );

        emit NewFund(
            msg.sender,
            address(hub),
            [
                routes.feeManager,
                routes.policyManager,
                routes.shares,
                routes.vault,
                routes.registry,
                routes.fundFactory
            ]
        );
    }

    function completeSetupFor(address _manager) external amguPayable payable { _completeSetupFor(_manager); }
    function completeSetup() external amguPayable payable { _completeSetupFor(msg.sender); }

    function getFundById(uint256 _id) external view returns (address) { return funds[_id]; }

    function getLastFundId() external view returns (uint256) { return funds.length - 1; }

    function getExchangesInfo(address _user) public view returns (address[] memory) {
        return (managersToSettings[_user].exchanges);
    }

    function shutDownFund(address _hub) external override {
        require(
            managersToHubs[msg.sender] == _hub,
            "Conditions not met for fund shutdown"
        );
        Hub(_hub).shutDownFund();
    }
}
