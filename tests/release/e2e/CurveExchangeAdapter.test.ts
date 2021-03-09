import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  curveTakeOrderArgs,
  ICurveAddressProvider,
  SpendAssetsHandleType,
  StandardToken,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  CurveSwaps,
  curveTakeOrder,
  ForkDeployment,
  loadForkDeployment,
  unlockWhales,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
// There is variable small discrepancy between get_best_rate().maxAmountReceived and the actual amount received,
// likely due to rounding somewhere
const curveRoundingBuffer = 5;

let whales: Record<string, SignerWithAddress>;
beforeAll(async () => {
  whales = await unlockWhales('weth', 'dai', 'lidoSteth');
});

let fork: ForkDeployment;
beforeEach(async () => {
  fork = await loadForkDeployment();
});

async function getCurveSwapsContract(addressProvider: AddressLike) {
  const curveAddressProvider = new ICurveAddressProvider(addressProvider, provider);
  const addr = await curveAddressProvider.get_address(2);
  return new CurveSwaps(addr, provider);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveExchangeAdapter = fork.deployment.CurveExchangeAdapter;

    const getIntegrationManagerCall = await curveExchangeAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.IntegrationManager);

    const getAddressProvider = await curveExchangeAdapter.getAddressProvider();
    expect(getAddressProvider).toMatchAddress(fork.config.curve.addressProvider);

    const getWethTokenCall = await curveExchangeAdapter.getWethToken();
    expect(getWethTokenCall).toMatchAddress(fork.config.weth);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const curveExchangeAdapter = fork.deployment.CurveExchangeAdapter;

    await expect(
      curveExchangeAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  it('does not allow empty _pool address', async () => {
    const curveExchangeAdapter = fork.deployment.CurveExchangeAdapter;
    const pool = constants.AddressZero;
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('0.1');
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('0.3');

    await expect(
      curveExchangeAdapter.parseAssetsForMethod(
        takeOrderSelector,
        curveTakeOrderArgs({
          pool,
          outgoingAsset,
          outgoingAssetAmount,
          incomingAsset,
          minIncomingAssetAmount,
        }),
      ),
    ).rejects.toBeRevertedWith('No pool address provided');
  });

  it('generates expected output', async () => {
    const curveExchangeAdapter = fork.deployment.CurveExchangeAdapter;
    const pool = randomAddress();
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('0.1');
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('0.3');

    const result = await curveExchangeAdapter.parseAssetsForMethod(
      takeOrderSelector,
      curveTakeOrderArgs({
        pool,
        outgoingAsset,
        outgoingAssetAmount,
        incomingAsset,
        minIncomingAssetAmount,
      }),
    );

    expect(result).toMatchFunctionOutput(curveExchangeAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

describe('takeOrder', () => {
  it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
    const outgoingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);
    const incomingAsset = new StandardToken(fork.config.primitives.usdc, provider);
    const curveSwaps = await getCurveSwapsContract(fork.config.curve.addressProvider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.FundDeployer,
    });

    const outgoingAssetAmount = utils.parseEther('1');

    const { bestPool, amountReceived } = await curveSwaps.get_best_rate(
      outgoingAsset.address,
      incomingAsset.address,
      outgoingAssetAmount,
    );

    // seed fund
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

    // exchange
    await curveTakeOrder({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveExchangeAdapter: fork.deployment.CurveExchangeAdapter,
      pool: bestPool,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: BigNumber.from(1),
    });

    const postTxIncomingAssetBalance = await incomingAsset.balanceOf(vaultProxy);

    expect(postTxIncomingAssetBalance).toBeGteBigNumber(amountReceived.sub(curveRoundingBuffer));
    await expect(outgoingAsset.balanceOf(vaultProxy)).resolves.toEqBigNumber(0);
  });

  it('works as expected when called by a fund (ETH to ERC20)', async () => {
    const outgoingAsset = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = new StandardToken(fork.config.lido.steth, provider);
    const curveSwaps = await getCurveSwapsContract(fork.config.curve.addressProvider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.FundDeployer,
    });

    const outgoingAssetAmount = utils.parseEther('1');

    const { bestPool, amountReceived } = await curveSwaps.get_best_rate(
      ETH_ADDRESS,
      incomingAsset.address,
      outgoingAssetAmount,
    );

    // seed fund
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

    // exchange
    await curveTakeOrder({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveExchangeAdapter: fork.deployment.CurveExchangeAdapter,
      pool: bestPool,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: BigNumber.from(1),
    });

    const postTxIncomingAssetBalance = await incomingAsset.balanceOf(vaultProxy);

    expect(postTxIncomingAssetBalance).toBeGteBigNumber(amountReceived.sub(curveRoundingBuffer));
    await expect(outgoingAsset.balanceOf(vaultProxy)).resolves.toEqBigNumber(0);
  });

  it('works as expected when called by a fund (ERC20 to ETH)', async () => {
    const outgoingAsset = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const incomingAsset = new StandardToken(fork.config.weth, provider);
    const curveSwaps = await getCurveSwapsContract(fork.config.curve.addressProvider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.FundDeployer,
    });

    const outgoingAssetAmount = utils.parseEther('1');

    const { bestPool, amountReceived } = await curveSwaps.get_best_rate(
      outgoingAsset.address,
      ETH_ADDRESS,
      outgoingAssetAmount,
    );

    // seed fund
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

    // exchange
    await curveTakeOrder({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveExchangeAdapter: fork.deployment.CurveExchangeAdapter,
      pool: bestPool,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: BigNumber.from(1),
    });

    const postTxIncomingAssetBalance = await incomingAsset.balanceOf(vaultProxy);

    expect(postTxIncomingAssetBalance).toBeGteBigNumber(amountReceived.sub(curveRoundingBuffer));
    await expect(outgoingAsset.balanceOf(vaultProxy)).resolves.toEqBigNumber(0);
  });
});
