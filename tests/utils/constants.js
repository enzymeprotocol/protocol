export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
export const KYBER_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const TRACKS = {
  // Track for testing with our own testing price feed
  TESTING: 'testing',
  // Track linked to the kyber price feed
  KYBER_PRICE: 'kyberPrice',
}

export const CONTRACT_NAMES = {
  ACCOUNTING: 'Accounting',
  ACCOUNTING_FACTORY: 'AccountingFactory',
  ADDRESS_LIST: 'AddressList',
  AMGU_CONSUMER: 'AmguConsumer',
  ASSET_BLACKLIST: 'AssetBlacklist',
  ASSET_WHITELIST: 'AssetWhitelist',
  BURNABLE_TOKEN: 'BurnableToken',
  CONVERSION_RATES: 'ConversionRates',
  ENGINE: 'Engine',
  ENGINE_ADAPTER: 'EngineAdapter',
  ETHFINEX_ADAPTER: 'EthfinexAdapter',
  EXCHANGE_ADAPTER: 'ExchangeAdapter',
  FALSE_POLICY: 'FalsePolicy',
  FEE_MANAGER: 'FeeManager',
  FEE_MANAGER_FACTORY: 'FeeManagerFactory',
  FUND_FACTORY: 'FundFactory',
  HUB: 'Hub',
  KYBER_ADAPTER: 'KyberAdapter',
  KYBER_EXCHANGE: 'KyberNetwork',
  KYBER_NETWORK_PROXY: 'KyberNetworkProxy',
  KYBER_PRICEFEED: 'KyberPriceFeed',
  KYBER_RESERVE: 'KyberReserve',
  KYBER_WHITELIST: 'KyberWhiteList',
  MALICIOUS_TOKEN: 'MaliciousToken',
  MANAGEMENT_FEE: 'ManagementFee',
  MAX_CONCENTRATION: 'MaxConcentration',
  MAX_POSITIONS: 'MaxPositions',
  MOCK_ACCOUNTING: 'MockAccounting',
  MOCK_ADAPTER: 'MockAdapter',
  MOCK_FEE: 'MockFee',
  MOCK_FEE_MANAGER: 'MockFeeManager',
  MOCK_HUB: 'MockHub',
  MOCK_REGISTRY: 'MockRegistry',
  MOCK_SHARES: 'MockShares',
  MOCK_VERSION: 'MockVersion',
  EXCHANGE_ADAPTER: 'ExchangeAdapter',
  OASIS_DEX_ADAPTER: 'OasisDexAdapter',
  OASIS_DEX_EXCHANGE: 'OasisDexExchange',
  ORDER_TAKER: 'OrderTaker',
  PARTICIPATION: 'Participation',
  PARTICIPATION_FACTORY: 'ParticipationFactory',
  PERFORMANCE_FEE: 'PerformanceFee',
  PERMISSIVE_AUTHORITY: 'PermissiveAuthority',
  POLICY: 'Policy',
  POLICY_MANAGER: 'PolicyManager',
  POLICY_MANAGER_FACTORY: 'PolicyManagerFactory',
  PREMINED_TOKEN: 'PreminedToken',
  PRICE_TOLERANCE: 'PriceTolerance',
  REGISTRY: 'Registry',
  SELF_DESTRUCTING: 'SelfDestructing',
  SHARES: 'Shares',
  SHARES_FACTORY: 'SharesFactory',
  SPOKE: 'Spoke',
  STANDARD_TOKEN: 'StandardToken',
  TESTING_PRICEFEED: 'TestingPriceFeed',
  TRADING: 'Trading',
  TRADING_FACTORY: 'TradingFactory',
  TRUE_POLICY: 'TruePolicy',
  UNISWAP_ADAPTER: 'UniswapAdapter',
  UNISWAP_EXCHANGE: 'UniswapFactory',
  UNISWAP_EXCHANGE_TEMPLATE: 'UniswapExchangeTemplate',
  USER_WHITELIST: 'UserWhitelist',
  VERSION: 'Version',
  WETH: 'WETH',
  WRAPPER_LOCK: 'WrapperLock',
  WRAPPER_LOCK_ETH: 'WrapperLockEth',
  WRAPPER_REGISTRY_EFX: 'WrapperRegistryEFX',
  ZERO_EX_V2_ADAPTER: 'ZeroExV2Adapter',
  ZERO_EX_V2_ERC20_PROXY: 'ZeroExV2ERC20Proxy',
  ZERO_EX_V2_EXCHANGE: 'ZeroExV2Exchange',
  ZERO_EX_V3_ADAPTER: 'ZeroExV3Adapter',
  ZERO_EX_V3_ERC20_PROXY: 'ZeroExV3ERC20Proxy',
  ZERO_EX_V3_EXCHANGE: 'ZeroExV3Exchange',
  ZERO_EX_V3_STAKING: 'ZeroExV3Staking',
  ZERO_EX_V3_STAKING_PROXY: 'ZeroExV3StakingProxy',
  ZERO_EX_V3_ZRX_VAULT: 'ZeroExV3ZrxVault'
}
