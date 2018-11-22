import * as web3EthAbi from 'web3-eth-abi';
import * as R from 'ramda';

import { initTestEnvironment } from '~/utils/environment';
import { deploy0xExchange } from '../transactions/deploy0xExchange';
import { deployToken, getToken } from '~/contracts/dependencies/token';
import { createQuantity } from '@melonproject/token-math/quantity';
import { create0xOrder, sign0xOrder } from './create0xOrder';
import { Contracts, requireMap } from '~/Contracts';
import { fill0xOrder } from '../transactions/fill0xOrder';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
  shared.zeroExExchangeAddress = await deploy0xExchange();

  shared.wethToken = await getToken(await deployToken('WETH'));
  shared.mlnToken = await getToken(await deployToken('MLN'));
  shared.zrxToken = await getToken(await deployToken('ZRX'));
});

test('Happy path', async () => {
  const makerQuantity = createQuantity(shared.mlnToken, 1);
  const takerQuantity = createQuantity(shared.wethToken, 0.05);

  const unsigned0xOrder = await create0xOrder(shared.zeroExExchangeAddress, {
    from: shared.accounts[0],
    makerQuantity,
    takerQuantity,
  });

  const signedOrder = await sign0xOrder(unsigned0xOrder, shared.environment);
  expect(signedOrder.exchangeAddress).toBe(
    shared.zeroExExchangeAddress.toLowerCase(),
  );
  expect(signedOrder.makerAddress).toBe(shared.accounts[0].toLowerCase());
  expect(signedOrder.makerAssetAmount.toString()).toBe(
    makerQuantity.quantity.toString(),
  );

  const signedOrderPairs = R.toPairs(signedOrder);
  const stringified = R.map(
    ([key, value]) => [key, value.toString()],
    signedOrderPairs,
  );
  const stringifiedSignedOrder = R.fromPairs(stringified);

  console.log(stringifiedSignedOrder);

  const exchangeAbi = requireMap[Contracts.ZeroExExchange];
  const fillOrderAbi = exchangeAbi.filter(a => a.name === 'fillOrder')[0];
  const encoded = web3EthAbi.encodeFunctionCall(fillOrderAbi, [
    stringifiedSignedOrder,
    stringifiedSignedOrder.makerAssetAmount,
    stringifiedSignedOrder.signature,
  ]);

  console.log(JSON.stringify(encoded, null, 2));

  const result = await fill0xOrder(
    shared.zeroExExchangeAddress,
    { signedOrder },
    { from: shared.accounts[1] },
  );

  //
  /*
  - makerQuantity
  - takerQuantity


  - sign0xOrder
  - fill0xOrder
   */
});