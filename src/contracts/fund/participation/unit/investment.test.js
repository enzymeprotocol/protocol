import { toWei } from 'web3-utils';

import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { increaseTime } from '~/utils/evm/increaseTime';
import { randomAddress } from '~/utils/helpers/randomAddress';

const weekInSeconds = 60 * 60 * 24 * 7;

describe('investment', () => {
  let s = {};

  beforeAll(async () => {
    // Setup environment
    s.env = await initTestEnvironment();

    // Define user accounts
    s.user = s.env.wallet.address;
    s.standardGas = 8000000;
    s.defaultTxOpts = { from: s.user, gas: s.standardGas };
    s.defaultAmgu = toWei('0.01', 'ether');

    // Setup necessary contracts
    s = {
      ...s,
      ...(await deployMockSystem(s.env, {
        accountingContract: Contracts.Accounting,
      })),
    };

    const price = toWei('1', 'ether');
    await s.priceSource.methods
      .update(
        [s.weth.options.address, s.mln.options.address],
        [price, price],
      )
      .send(s.defaultTxOpts);

    await s.registry.methods
      .setIsFund(s.participation.options.address)
      .send(s.defaultTxOpts);
  });

  it('Invest fails in shut down fund', async () => {
    const errorMessage = 'Hub is shut down';
    const amount = toWei('1', 'ether');
    await s.hub.methods.setShutDownState(true).send(s.defaultTxOpts);

    await expect(
      s.participation.methods
        .requestInvestment(amount, amount, s.weth.options.address)
        .send(s.defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await s.hub.methods.setShutDownState(false).send(s.defaultTxOpts);
    await s.weth.methods
      .approve(s.participation.options.address, amount)
      .send(s.defaultTxOpts);
    await s.participation.methods
      .requestInvestment(amount, amount, s.weth.options.address)
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });

    await s.hub.methods.setShutDownState(true).send(s.defaultTxOpts);

    await expect(
      s.participation.methods.executeRequestFor(s.user).send(s.defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await s.hub.methods.setShutDownState(false).send(s.defaultTxOpts);
    await increaseTime(s.env, weekInSeconds);
    await s.participation.methods
      .cancelRequest()
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });
  });

  it('Request must exist to execute', async () => {
    const errorMessage = 'No valid request for this address';
    const requestExists = await s.participation.methods
      .hasRequest(s.user)
      .call();

    expect(requestExists).toBe(false);
    await expect(
      s.participation.methods.executeRequestFor(s.user).send(s.defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await s.participation.methods
      .requestInvestment(0, 0, s.weth.options.address)
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });

    await expect(
      s.participation.methods.executeRequestFor(s.user).send(s.defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await increaseTime(s.env, weekInSeconds);
    await s.participation.methods
      .cancelRequest()
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });
  });

  it('Need fresh price to execute request', async () => {
    const errorMessage = 'Price not valid';
    const amount = toWei('1', 'ether');

    await s.priceSource.methods
      .setNeverValid(true)
      .send(s.defaultTxOpts);

    await s.weth.methods
      .approve(s.participation.options.address, amount)
      .send(s.defaultTxOpts);
    await s.participation.methods
      .requestInvestment(amount, amount, s.weth.options.address)
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });
    const requestExists = await s.participation.methods
      .hasRequest(s.user)
      .call();

    expect(requestExists).toBe(true);
    await expect(
      s.participation.methods
        .executeRequestFor(s.user)
        .send(s.defaultTxOpts)
    ).rejects.toThrow(errorMessage);

    await s.priceSource.methods
      .setNeverValid(false)
      .send(s.defaultTxOpts);
    await increaseTime(s.env, weekInSeconds);
    await s.participation.methods
      .cancelRequest()
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu })
  });

  it('Asset must be permitted', async () => {
    const errorMessage = 'Investment not allowed in this asset';
    const asset = `${randomAddress()}`;
    const amount = '100';
    const allowed = await s.participation.methods
      .investAllowed(asset)
      .call();

    expect(allowed).toBe(false);

    await expect(
      s.participation.methods
        .requestInvestment(amount, amount, asset)
        .send({ ...s.defaultTxOpts, value: s.defaultAmgu })
    ).rejects.toThrow(errorMessage);
  });

  it('Invested amount must be above price minimum', async () => {
    const errorMessage = 'Invested amount too low';
    const price = toWei('1', 'ether');
    await s.priceSource.methods
      .update(
        [s.weth.options.address, s.mln.options.address],
        [price, price],
      )
      .send(s.defaultTxOpts);
    await s.weth.methods
      .approve(s.participation.options.address, '1000')
      .send(s.defaultTxOpts);
    await s.participation.methods
      .requestInvestment('1000', '1', s.weth.options.address)
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });

    await expect(
      s.participation.methods
        .executeRequestFor(s.user)
        .send({ ...s.defaultTxOpts, value: s.defaultAmgu })
    ).rejects.toThrow(errorMessage);

    await increaseTime(s.env, weekInSeconds);
    await s.participation.methods
      .cancelRequest()
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });
  });

  it('Basic investment works', async () => {
    const investAmount = '1000';
    const sharesAmount = '1000';
    const preVaultWeth = await s.weth.methods
      .balanceOf(s.vault.options.address)
      .call();
    await s.weth.methods
      .approve(s.participation.options.address, investAmount)
      .send(s.defaultTxOpts);
    await s.participation.methods
      .requestInvestment(
        sharesAmount,
        investAmount,
        s.weth.options.address,
      )
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });
    await s.participation.methods
      .executeRequestFor(s.user)
      .send({ ...s.defaultTxOpts, value: s.defaultAmgu });
    const postVaultWeth = await s.weth.methods
      .balanceOf(s.vault.options.address)
      .call();
    const postShares = await s.shares.methods
      .balanceOf(s.user)
      .call();
    const postSupply = await s.shares.methods.totalSupply().call();

    expect(postShares).toEqual(sharesAmount);
    expect(postSupply).toEqual(sharesAmount);
    expect(Number(postVaultWeth)).toEqual(
      Number(preVaultWeth) + Number(investAmount),
    );
  });
});