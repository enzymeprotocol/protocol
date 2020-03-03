pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";
import "../interfaces/IUniswapFactory.sol";
import "../interfaces/IUniswapExchange.sol";
import "../../dependencies/WETH.sol";

/// @title UniswapAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and Uniswap
contract UniswapAdapter is ExchangeAdapter, OrderTaker {
    /// @notice Extract arguments for risk management validations of a takeOrder call
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
            address[2] memory orderAddresses,
            uint256[2] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        rskMngAddrs = [
            address(0),
            address(this),
            orderAddresses[0],
            orderAddresses[1],
            address(0),
            address(0)
        ];
        rskMngVals = [
            orderValues[0],
            orderValues[1],
            orderValues[1]
        ];

        return (rskMngAddrs, rskMngVals);
    }

    /// @notice Take a market order on Uniswap (takeOrder)
    /// @param _targetExchange Address of Uniswap factory contract
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
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts,
        ) = __decodeOrderFillData(_fillData);

        if (fillAssets[1] == __getNativeAssetAddress()) {
            __swapNativeAssetToToken(
                _targetExchange,
                fillAssets,
                fillExpectedAmounts
            );
        }
        else if (fillAssets[0] == __getNativeAssetAddress()) {
            __swapTokenToNativeAsset(
                _targetExchange,
                fillAssets,
                fillExpectedAmounts
            );
        }
        else {
            __swapTokenToToken(
                _targetExchange,
                fillAssets,
                fillExpectedAmounts
            );
        }
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return _fillApprovalTargets Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Uniswap exchange of taker asset
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
            address[2] memory orderAddresses,
            uint256[2] memory orderValues
        ) = __decodeTakeOrderArgs(_encodedArgs);

        address[] memory fillAssets = new address[](2);
        fillAssets[0] = orderAddresses[0]; // maker asset
        fillAssets[1] = orderAddresses[1]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = orderValues[1]; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = fillAssets[1] == __getNativeAssetAddress() ?
            address(0) :
            IUniswapFactory(_targetExchange).getExchange(fillAssets[1]); // Uniswap exchange of taker asset

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _encodedArgs Encoded parameters passed from client side
    function __validateTakeOrderParams(
        address _targetExchange,
        bytes memory _encodedArgs
    )
        internal
        view
        override
    {
        require(true);
    }

    // PRIVATE FUNCTIONS

    /// @notice Executes a swap of ETH (taker) to ERC20 (maker)
    function __swapNativeAssetToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        require(
            __getAccounting().assetBalances(_fillAssets[1]) >= _fillExpectedAmounts[1],
            "__swapNativeAssetToToken: insufficient native token assetBalance"
        );

        // Convert WETH to ETH
        WETH(payable(_fillAssets[1])).withdraw(_fillExpectedAmounts[1]);

        // Swap tokens
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[0]);
        IUniswapExchange(tokenExchange).ethToTokenSwapInput.value(
            _fillExpectedAmounts[1]
        )
        (
            _fillExpectedAmounts[0],
            add(block.timestamp, 1)
        );
    }

    /// @notice Executes a swap of ERC20 (taker) to ETH (maker)
    function __swapTokenToNativeAsset(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[1]);
        uint256 preEthBalance = payable(address(this)).balance;
        IUniswapExchange(tokenExchange).tokenToEthSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            add(block.timestamp, 1)
        );
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Convert ETH to WETH
        WETH(payable(_fillAssets[0])).deposit.value(ethFilledAmount)();
    }

    /// @notice Executes a swap of ERC20 (taker) to ERC20 (maker)
    function __swapTokenToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[1]);
        IUniswapExchange(tokenExchange).tokenToTokenSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            1,
            add(block.timestamp, 1),
            _fillAssets[0]
        );
    }

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return orderAddresses needed addresses for an exchange to take an order
    /// - [0] Maker asset
    /// - [1] Taker asset
    /// @return orderValues needed values for an exchange to take an order
    /// - [0] Maker asset quantity
    /// - [1] Taker asset quantity
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address[2] memory orderAddresses,
            uint256[2] memory orderValues
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address[2],
                uint256[2]
            )
        );
    }
}
