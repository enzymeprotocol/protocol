import { BN, toWei } from 'web3-utils';

import { Contracts, Exchanges } from '~/Contracts';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { kyberEthAddress } from '~/utils/constants/kyberEthAddress';
import { takeOrderSignature } from '~/utils/constants/orderSignatures';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { getFundComponents } from '~/utils/getFundComponents';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { stringToBytes32 } from '~/utils/helpers/stringToBytes32';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { BNExpMul } from '../utils/new/BNmath';

describe('fund-kyber-trading', () => {
  let environment, accounts, defaultTxOpts, managerTxOpts;
  let deployer, manager, investor;
  let addresses, contracts;
  let exchangeIndex;
  let initialTokenAmount;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    accounts = await environment.eth.getAccounts();
    [deployer, manager, investor] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    managerTxOpts = { ...defaultTxOpts, from: manager };

    const envManager = withDifferentAccount(environment, manager);

    const system = await deployAndGetSystem(environment);
    addresses = system.addresses;
    contracts = system.contracts;

    const KyberAddresses = addresses.exchangeConfigs[Exchanges.KyberNetwork];

    const {
      version: fundFactory,
      kyberAdapter,
      kyberNetwork,
      weth,
      mln,
    } = contracts;

    await fundFactory.methods
      .beginSetup(
        stringToBytes32('Test fund'),
        [],
        [],
        [],
        [KyberAddresses.exchange.toString()],
        [KyberAddresses.adapter.toString()],
        weth.options.address.toString(),
        [mln.options.address.toString(), weth.options.address.toString()],
      )
      .send(managerTxOpts);

    await fundFactory.methods.createAccounting().send(managerTxOpts);
    await fundFactory.methods.createFeeManager().send(managerTxOpts);
    await fundFactory.methods.createParticipation().send(managerTxOpts);
    await fundFactory.methods.createPolicyManager().send(managerTxOpts);
    await fundFactory.methods.createShares().send(managerTxOpts);
    await fundFactory.methods.createTrading().send(managerTxOpts);
    await fundFactory.methods.createVault().send(managerTxOpts);
    const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
    const hubAddress = res.events.NewFund.returnValues.hub;
    contracts.fund = await getFundComponents(envManager, hubAddress);

    contracts.kyberNetworkProxy = getContract(
      environment,
      Contracts.KyberNetworkProxy,
      KyberAddresses.exchange.toString(),
    );

    const { trading } = contracts.fund;
    const exchangeInfo = await contracts.fund.trading.methods
      .getExchangeInfo()
      .call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === KyberAddresses.adapter.toLowerCase(),
    );

    initialTokenAmount = toWei('10', 'ether');

    await updateTestingPriceFeed(contracts, environment);
  });

  test('investor gets initial ethToken for testing)', async () => {
    const { fund, weth } = contracts;

    const preWethInvestor = await weth.methods.balanceOf(investor).call();

    await weth.methods
      .transfer(investor, initialTokenAmount)
      .send(defaultTxOpts);

    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).add(new BN(initialTokenAmount)),
      ),
    ).toBe(true);
  });

  test('fund receives ETH from investment', async () => {
    const { fund, weth } = contracts;
    const investorTxOpts = { ...defaultTxOpts, from: investor };
    const offeredValue = toWei('1', 'ether');
    const wantedShares = toWei('1', 'ether');
    const amguAmount = toWei('.01', 'ether');

    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethInvestor = await weth.methods.balanceOf(investor).call();

    await weth.methods
      .approve(fund.participation.options.address, offeredValue)
      .send(investorTxOpts);
    await fund.participation.methods
      .requestInvestment(offeredValue, wantedShares, weth.options.address)
      .send({ ...investorTxOpts, value: amguAmount });
    await fund.participation.methods
      .executeRequestFor(investor)
      .send(investorTxOpts);

    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethInvestor = await weth.methods.balanceOf(investor).call();

    expect(
      new BN(postWethInvestor).eq(
        new BN(preWethInvestor).sub(new BN(offeredValue)),
      ),
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(new BN(preWethFund).add(new BN(offeredValue))),
    ).toBe(true);
  });

  test('swap ethToken for mln with specific order price (minRate)', async () => {
    const { fund, kyberNetworkProxy, mln, weth } = contracts;
    const { trading } = contracts.fund;

    const takerAsset = weth.options.address;
    const takerQuantity = toWei('0.1', 'ether');
    const makerAsset = mln.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(kyberEthAddress, makerAsset, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate),
    ).toString();

    const preMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        FunctionSignatures.takeOrder,
        [
          emptyAddress,
          emptyAddress,
          makerAsset,
          takerAsset,
          emptyAddress,
          emptyAddress,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        randomHexOfSize(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const postMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(
      new BN(postWethFund).eq(new BN(preWethFund).sub(new BN(takerQuantity))),
    ).toBe(true);
    expect(
      new BN(postMlnFund).eq(new BN(preMlnFund).add(new BN(makerQuantity))),
    ).toBe(true);
  });

  test('swap mlnToken for ethToken with specific order price (minRate)', async () => {
    const { fund, kyberNetworkProxy, mln, weth } = contracts;
    const { trading } = contracts.fund;

    const takerAsset = mln.options.address;
    const takerQuantity = toWei('0.01', 'ether');
    const makerAsset = weth.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(takerAsset, kyberEthAddress, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate),
    ).toString();

    const preMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        FunctionSignatures.takeOrder,
        [
          emptyAddress,
          emptyAddress,
          makerAsset,
          takerAsset,
          emptyAddress,
          emptyAddress,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        randomHexOfSize(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const postMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(
      new BN(postMlnFund).eq(new BN(preMlnFund).sub(new BN(takerQuantity))),
    ).toBe(true);
    expect(
      new BN(postWethFund).eq(new BN(preWethFund).add(new BN(makerQuantity))),
    ).toBe(true);
  });

  test('swap mlnToken directly to eurToken without minimum destAmount', async () => {
    const { fund, kyberNetworkProxy, mln, eur, weth } = contracts;
    const { trading } = contracts.fund;

    const takerAsset = mln.options.address;
    const takerQuantity = toWei('0.01', 'ether');
    const makerAsset = eur.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(takerAsset, makerAsset, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate),
    ).toString();

    const preEurFund = await eur.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        FunctionSignatures.takeOrder,
        [
          emptyAddress,
          emptyAddress,
          makerAsset,
          takerAsset,
          emptyAddress,
          emptyAddress,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        randomHexOfSize(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send(managerTxOpts);

    const postEurFund = await eur.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postMlnFund = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postWethFund = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(postWethFund).toEqual(preWethFund);
    expect(
      new BN(postMlnFund).eq(new BN(preMlnFund).sub(new BN(takerQuantity))),
    ).toBe(true);
    expect(
      new BN(postEurFund).eq(new BN(preEurFund).add(new BN(makerQuantity))),
    ).toBe(true);
  });

  test('takeOrder fails if minPrice is not satisfied', async () => {
    const { fund, kyberNetworkProxy, mln, eur, weth } = contracts;
    const { trading } = contracts.fund;

    const takerAsset = mln.options.address;
    const takerQuantity = toWei('0.1', 'ether');
    const makerAsset = eur.options.address;

    const { 0: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(takerAsset, makerAsset, takerQuantity)
      .call(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate).mul(new BN(2)),
    ).toString();

    expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          FunctionSignatures.takeOrder,
          [
            emptyAddress,
            emptyAddress,
            makerAsset,
            takerAsset,
            emptyAddress,
            emptyAddress,
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          randomHexOfSize(20),
          '0x0',
          '0x0',
          '0x0',
        )
        .send(managerTxOpts),
    ).resolves.toThrow();
  });
});