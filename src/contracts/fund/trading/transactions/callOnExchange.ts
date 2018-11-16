import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getHub, ensureIsNotShutDown } from '../../hub';
import { Address } from '~/utils';

export interface CallOnExchangeArgs {
  exchangeIndex: number;
  method: string;
  maker: Address;
  taker: Address;
  makerAsset: Address;
  takerAsset: Address;
  feeRecipient: Address;
  senderAddress: Address;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  makerFee: QuantityInterface;
  takerFee: QuantityInterface;
  timestamp: number;
  salt: string;
  fillTakerTokenAmount: QuantityInterface;
  dexySignatureMode: number;
  identifier: number;
  makerAssetData: any;
  takerAssetData: any;
  signature: any;
}

const guard: GuardFunction<CallOnExchangeArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
};

const prepareArgs: PrepareArgsFunction<CallOnExchangeArgs> = async ({
  exchangeIndex,
  method,
  maker,
  taker,
  makerAsset,
  takerAsset,
  feeRecipient,
  senderAddress,
  makerQuantity,
  takerQuantity,
  makerFee,
  takerFee,
  timestamp,
  salt,
  fillTakerTokenAmount,
  dexySignatureMode,
  identifier,
  makerAssetData,
  takerAssetData,
  signature,
}) => {
  return [
    exchangeIndex,
    method,
    [maker, taker, makerAsset, takerAsset, feeRecipient, senderAddress],
    [
      makerQuantity.toString(),
      takerQuantity.toString(),
      makerFee.toString(),
      takerFee.toString(),
      timestamp,
      salt,
      fillTakerTokenAmount.toString(),
      dexySignatureMode,
    ],
    `0x${Number(identifier)
      .toString(16)
      .padStart(64, '0')}`,
    signature,
    makerAssetData,
    takerAssetData,
  ];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return receipt;
};

const callOnExchange = transactionFactory(
  'callOnExchange',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
);

export { callOnExchange };
