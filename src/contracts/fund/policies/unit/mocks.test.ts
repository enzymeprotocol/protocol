import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { Contracts } from '~/Contracts';
import { randomAddress } from '~/utils/helpers';
import { deployAndGetContract } from '~/utils/solidity';
import { emptyAddress } from '~/utils/constants';
import * as Web3Utils from 'web3-utils';

jest.setTimeout(30000);

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.user = shared.env.wallet.address;

  shared.falsePolicy = await deployAndGetContract(Contracts.FalsePolicy);
  shared.truePolicy = await deployAndGetContract(Contracts.TruePolicy);
  shared.testPolicy = Web3Utils.sha3(
    'testPolicy(address[4],uint256[2])',
  ).substring(0, 10);
  shared.dummyArgs = [
    shared.testPolicy,
    [emptyAddress, emptyAddress, emptyAddress, emptyAddress, emptyAddress],
    [0, 0, 0],
    '0x0',
  ];
});

const createManagerAndRegister = async (contract, policy) => {
  const manager = await deployAndGetContract(contract, [`${randomAddress()}`]);
  await manager.methods
    .register(shared.testPolicy, policy)
    .send({ from: shared.user, gas: 8000000 });
  return manager;
};

test('Boolean policies', async () => {
  const res1 = await shared.falsePolicy.methods
    .rule(...shared.dummyArgs)
    .call();
  const res2 = await shared.truePolicy.methods.rule(...shared.dummyArgs).call();
  expect(res1).toBe(false);
  expect(res2).toBe(true);
});

test('Boolean policies on policy manager', async () => {
  const manager1 = await createManagerAndRegister(
    Contracts.PolicyManager,
    shared.falsePolicy.options.address,
  );
  await expect(
    manager1.methods.preValidate(...shared.dummyArgs).call(),
  ).rejects.toThrow('Rule evaluated to false');

  const manager2 = await createManagerAndRegister(
    Contracts.PolicyManager,
    shared.truePolicy.options.address,
  );
  await expect(
    manager2.methods.preValidate(...shared.dummyArgs).call(),
  ).resolves.not.toThrow();
});