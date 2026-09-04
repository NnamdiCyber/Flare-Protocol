export default () => ({
  stellar: {
    network: process.env.STELLAR_NETWORK || 'testnet',
    rpcUrl:
      process.env.STELLAR_RPC_URL ||
      'https://soroban-testnet.stellar.org',
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      'Test SDF Network ; September 2015',
  },
  contracts: {
    registry: process.env.REGISTRY_CONTRACT_ID || '',
    campaignManager: process.env.CAMPAIGN_MANAGER_CONTRACT_ID || '',
    rewardVault: process.env.REWARD_VAULT_CONTRACT_ID || '',
  },
  oracle: {
    publicKey: process.env.ORACLE_PUBLIC_KEY || '',
    privateKey: process.env.ORACLE_PRIVATE_KEY || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'changeme',
  },
});
