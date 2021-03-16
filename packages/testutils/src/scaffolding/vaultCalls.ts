import { AddressLike } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  curveMinterMintManySelector,
  curveMinterMintSelector,
  curveMinterToggleApproveMintSelector,
  encodeArgs,
  sighash,
  StandardToken,
} from '@enzymefinance/protocol';
import { BigNumberish, constants } from 'ethers';

export function vaultCallApproveAsset({
  comptrollerProxy,
  asset,
  spender,
  amount = constants.MaxUint256,
}: {
  comptrollerProxy: ComptrollerLib;
  asset: StandardToken;
  spender: AddressLike;
  amount?: BigNumberish;
}) {
  return comptrollerProxy.vaultCallOnContract(
    asset,
    sighash(asset.approve.fragment),
    encodeArgs(['address', 'uint256'], [spender, amount]),
  );
}

export function vaultCallCurveMinterMint({
  comptrollerProxy,
  minter,
  gauge,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  gauge: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(minter, curveMinterMintSelector, encodeArgs(['address'], [gauge]));
}

export function vaultCallCurveMinterMintMany({
  comptrollerProxy,
  minter,
  gauges,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  gauges: AddressLike[];
}) {
  const gaugesFormatted = new Array(8).fill(constants.AddressZero);
  for (const i in gauges) {
    gaugesFormatted[i] = gauges[i];
  }

  return comptrollerProxy.vaultCallOnContract(
    minter,
    curveMinterMintManySelector,
    encodeArgs(['address[8]'], [gaugesFormatted]),
  );
}

export function vaultCallCurveMinterToggleApproveMint({
  comptrollerProxy,
  minter,
  account,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  account: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(
    minter,
    curveMinterToggleApproveMintSelector,
    encodeArgs(['address'], [account]),
  );
}
