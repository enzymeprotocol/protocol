pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../interfaces/IZeroExV3.sol";
import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";

/// @title ZeroExV3Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV3 Exchange Contract
contract ZeroExV3Adapter is ExchangeAdapter, OrderTaker {
    /// @notice Extract arguments for risk management validations
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return rskMngAddrs needed addresses for risk management
    /// - [0] Maker address
    /// - [1] Taker address
    /// - [2] Maker asset
    /// - [3] Taker asset
    /// - [4] Maker fee asset
    /// - [5] Taker fee asset
    /// @return rskMngVals needed values for risk management
    /// - [0] Maker asset amount
    /// - [1] Taker asset amount
    /// - [2] Fill amount
    function extractTakeOrderRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        view
        override
        returns (address[6] memory, uint256[3] memory)
    {
        address[6] memory rskMngAddrs;
        uint256[3] memory rskMngVals;
        (
            address[4] memory orderAddresses,
            uint256[7] memory orderValues,
            bytes[4] memory orderData,
        ) = __decodeTakeOrderArgs(_encodedArgs);

        rskMngAddrs = [
            orderAddresses[0],
            orderAddresses[1],
            __getAssetAddress(orderData[0]),
            __getAssetAddress(orderData[1]),
            __getAssetAddress(orderData[2]),
            __getAssetAddress(orderData[3])
        ];
        rskMngVals = [
            orderValues[0],
            orderValues[1],
            orderValues[6]
        ];

        return (rskMngAddrs, rskMngVals);
    }

    /// @notice Takes an active order on 0x v3 (takeOrder)
    /// @param _targetExchange Address of 0x v3 exchange
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(
        address _targetExchange,
        bytes memory _encodedArgs,
        bytes memory _fillData
    )
        internal
        override
        validateAndFinalizeFilledOrder(_targetExchange, _fillData)
    {
        (
            address[4] memory orderAddresses,
            uint256[7] memory orderValues,
            bytes[4] memory orderData,
            bytes memory signature
        ) = __decodeTakeOrderArgs(_encodedArgs);

        (,uint256[] memory fillExpectedAmounts,) = __decodeOrderFillData(_fillData);

        // Execute take order on exchange
        IZeroExV3(_targetExchange).fillOrder(
            __constructOrderStruct(orderAddresses, orderValues, orderData),
            fillExpectedAmounts[1],
            signature
        );
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of 0x v3 exchange
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// - [2] Protocol Fee asset (WETH)
    /// - [3] Taker Fee asset (same as _orderAddresses[7])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// - [2] Expected (max) quantity of protocol asset to spend
    /// - [3] Expected (max) quantity of taker fee asset to spend
    /// @return _fillApprovalTargets Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] 0x asset proxy for the taker asset
    /// - [2] 0x protocolFeeCollector
    /// - [3] 0x asset proxy for the taker fee asset
    function __formatFillTakeOrderArgs(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        (
            ,uint256[7] memory orderValues,
            bytes[4] memory orderData,
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](4);
        fillAssets[0] = __getAssetAddress(orderData[0]); // maker asset
        fillAssets[1] = __getAssetAddress(orderData[1]); // taker asset
        fillAssets[2] = __getNativeAssetAddress(); // protocol fee
        fillAssets[3] = __getAssetAddress(orderData[3]); // taker fee asset

        uint256[] memory fillExpectedAmounts = new uint256[](4);
        fillExpectedAmounts[0] = __calculateRelativeQuantity(
            orderValues[1],
            orderValues[0],
            orderValues[6]
        ); // maker fill amount; calculated relative to taker fill amount
        fillExpectedAmounts[1] = orderValues[6]; // taker fill amount
        fillExpectedAmounts[2] = __calcProtocolFeeAmount(_targetExchange); // protocol fee
        fillExpectedAmounts[3] = __calculateRelativeQuantity(
            orderValues[1],
            orderValues[3],
            orderValues[6]
        ); // taker fee amount; calculated relative to taker fill amount

        address[] memory fillApprovalTargets = new address[](4);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = __getAssetProxy(_targetExchange, orderData[1]); // 0x asset proxy for taker asset
        fillApprovalTargets[2] = IZeroExV3(_targetExchange).protocolFeeCollector(); // 0x protocol fee collector
        fillApprovalTargets[3] = __getAssetProxy(_targetExchange, orderData[3]); // 0x asset proxy for taker fee asset

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of 0x v3 exchange
    /// @param _encodedArgs Encoded parameters passed from client side
    function __validateTakeOrderParams(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
    {
        (
            address[4] memory orderAddresses,
            uint256[7] memory orderValues,
            bytes[4] memory orderData,
            bytes memory signature
        ) = __decodeTakeOrderArgs(_encodedArgs);

        require(
            orderValues[6] <= orderValues[1],
            "__validateTakeOrderParams: taker fill amount greater than max order quantity"
        );
        require(
            IZeroExV3(_targetExchange).isValidOrderSignature(
                __constructOrderStruct(orderAddresses, orderValues, orderData),
                signature
            ),
            "__validateTakeOrderParams: order signature is invalid"
        );
    }

    // PRIVATE FUNCTIONS

    function __calcProtocolFeeAmount(address _targetExchange) private view returns (uint256) {
        return mul(IZeroExV3(_targetExchange).protocolFeeMultiplier(), tx.gasprice);
    }

    /// @notice Parses user inputs into a ZeroExV3.Order format
    function __constructOrderStruct(
        address[4] memory _orderAddresses,
        uint256[7] memory _orderValues,
        bytes[4] memory _orderData
    )
        private
        pure
        returns (IZeroExV3.Order memory order_)
    {
        order_ = IZeroExV3.Order({
            makerAddress: _orderAddresses[0],
            takerAddress: _orderAddresses[1],
            feeRecipientAddress: _orderAddresses[2],
            senderAddress: _orderAddresses[3],
            makerAssetAmount: _orderValues[0],
            takerAssetAmount: _orderValues[1],
            makerFee: _orderValues[2],
            takerFee: _orderValues[3],
            expirationTimeSeconds: _orderValues[4],
            salt: _orderValues[5],
            makerAssetData: _orderData[0],
            takerAssetData: _orderData[1],
            makerFeeAssetData: _orderData[2],
            takerFeeAssetData: _orderData[3]
        });
    }

    /// @notice Gets the 0x assetProxy address for an ERC20 token
    function __getAssetProxy(address _targetExchange, bytes memory _assetData)
        private
        view
        returns (address assetProxy_)
    {
        bytes4 assetProxyId;
        assembly {
            assetProxyId := and(mload(
                add(_assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy_ = IZeroExV3(_targetExchange).getAssetProxy(assetProxyId);
    }

    /// @notice Parses the asset address from 0x assetData
    function __getAssetAddress(bytes memory _assetData)
        private
        pure
        returns (address assetAddress_)
    {
        assembly {
            assetAddress_ := mload(add(_assetData, 36))
        }
    }

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return orderAddresses needed addresses for an exchange to take an order
    /// - [0] 0x Order param: makerAddress
    /// - [1] 0x Order param: takerAddress
    /// - [2] 0x Order param: feeRecipientAddress
    /// - [3] 0x Order param: senderAddress
    /// @return orderValues needed values for an exchange to take an order
    /// - [0] 0x Order param: makerAssetAmount
    /// - [1] 0x Order param: takerAssetAmount
    /// - [2] 0x Order param: makerFee
    /// - [3] 0x Order param: takerFee
    /// - [4] 0x Order param: expirationTimeSeconds
    /// - [5] 0x Order param: salt
    /// - [6] Taker asset fill quantity
    /// @return orderData Need data for an exchange to take an order
    /// - [0] 0x Order param: makerAssetData
    /// - [1] 0x Order param: takerAssetData
    /// - [2] 0x Order param: makerFeeAssetData
    /// - [3] 0x Order param: takerFeeAssetData
    /// @return signature Signature of the order
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[4] memory orderAddresses,
            uint256[7] memory orderValues,
            bytes[4] memory orderData,
            bytes memory signature
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[4],
                uint256[7],
                bytes[4],
                bytes
            )
        );
    }
}
