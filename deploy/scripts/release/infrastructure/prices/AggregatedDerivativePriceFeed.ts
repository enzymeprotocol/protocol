import { AggregatedDerivativePriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const aavePriceFeed = await get('AavePriceFeed');
  const alphaHomoraV1PriceFeed = await get('AlphaHomoraV1PriceFeed');
  const wdgldPriceFeed = await get('WdgldPriceFeed');
  const curvePriceFeed = await get('CurvePriceFeed');
  const chaiPriceFeed = await get('ChaiPriceFeed');
  const compoundPriceFeed = await get('CompoundPriceFeed');
  const stakehoundEthPriceFeed = await get('StakehoundEthPriceFeed');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');
  const lidoStethPriceFeed = await get('LidoStethPriceFeed');

  const derivativePairs: [string, string][] = [
    [config.alphaHomoraV1.ibeth, alphaHomoraV1PriceFeed.address],
    [config.wdgld.wdgld, wdgldPriceFeed.address],
    [config.chai.chai, chaiPriceFeed.address],
    [config.compound.ceth, compoundPriceFeed.address],
    [config.lido.steth, lidoStethPriceFeed.address],
    [config.stakehound.steth, stakehoundEthPriceFeed.address],
    ...Object.values(config.synthetix.synths).map((synth) => [synth, synthetixPriceFeed.address] as [string, string]),
    ...Object.values(config.compound.ctokens).map((ctoken) => [ctoken, compoundPriceFeed.address] as [string, string]),
    ...Object.values(config.aave.atokens).map(([atoken]) => [atoken, aavePriceFeed.address] as [string, string]),
    ...Object.values(config.curve.pools).map((pool) => [pool.lpToken, curvePriceFeed.address] as [string, string]),
    ...Object.values(config.curve.pools).map(
      (pool) => [pool.liquidityGaugeToken, curvePriceFeed.address] as [string, string],
    ),
  ];

  const derivatives = derivativePairs.map(([derivative]) => derivative);
  const feeds = derivativePairs.map(([, feed]) => feed);

  await deploy('AggregatedDerivativePriceFeed', {
    args: [dispatcher.address, derivatives, feeds] as AggregatedDerivativePriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'AggregatedDerivativePriceFeed'];
fn.dependencies = [
  'Config',
  'Dispatcher',
  'AavePriceFeed',
  'AlphaHomoraV1PriceFeed',
  'CurvePriceFeed',
  'ChaiPriceFeed',
  'CompoundPriceFeed',
  'LidoStethPriceFeed',
  'StakehoundEthPriceFeed',
  'SynthetixPriceFeed',
  'WdgldPriceFeed',
];

export default fn;
