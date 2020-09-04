const bip32 = require('bip32')
const bip39 = require('bip39')
const ghost_bitcore = require('ghost-bitcore-lib')

const fetch = require('node-fetch');

const { networkType } = require('./../domain/network')
const bip44 = require('./../helpers/bip44')


const netNames = {
  'mainnet': 'mainnet',
  'testnet': 'testnet',
}

const GHOST = {
  ticker: 'GHOST',
  name: 'Ghost',
  precision: 8,
  networks: netNames,

  [netNames.mainnet]: {
    type: networkType.mainnet,
    bip32settings: {
      // bip32settings from https://github.com/JoaoCampos89/ghost-samples/blob/master/examples/transaction/index.js
      // bip32settings from https://github.com/ghost-coin/ghost-bitcore-lib/blob/master/lib/networks.js (wrong?)
      messagePrefix: '\x18Bitcoin Signed Message:\n',
      bech32: 'gp',
      bip32: {
        public:  0x68df7cbd,
        private: 0x8e8ea8ea,
      },
      pubKeyHash: 0x26,
      scriptHash: 0x61,
      wif: 0xa6,
    },
    bip44settings: {
      coinIndex: 531,
    },
    getBalance: async (addr) =>
      await connector.fetchBalance(networkType.mainnet, addr),
    publishRawTx: async (rawTx) =>
      await connector.publishRawTx(networkType.mainnet, rawTx),
    getTxUrl: (txId) =>
      connector.getTxUrl(networkType.mainnet, txId),
  },

  [netNames.testnet]: {
    type: networkType.testnet,
    bip32settings: {
      messagePrefix: '\x18Bitcoin Signed Message:\n',
      bech32: 'tb',
      bip32: {
        public: 0x043587cf,
        private: 0x04358394,
      },
      pubKeyHash: 0x6f,
      scriptHash: 0xc4,
      wif: 0x2e,
    },
    bip44settings: {
      coinIndex: 531,
    },
    accountFromMnemonic: (mnemonic) =>
      libAdapter.accountFromMnemonic(mnemonic, netNames.testnet),
    getBalance: async (addr) =>
      await connector.fetchBalance(networkType.testnet, addr),
    createTx: async ({ account, amount, to }) =>
      await libAdapter.createTx({
        netName: netNames.testnet,
        account,
        amount,
        to
      }),
    publishRawTx: async (rawTx) =>
      await connector.publishRawTx(networkType.testnet, rawTx),
    getTxUrl: (txId) =>
      connector.getTxUrl(networkType.testnet, txId),
    get _connector() { // todo: remove
      return connector
    },
  }
}

module.exports = GHOST



const libAdapter = {

  accountFromMnemonic(mnemonic, netName) {
    const network = GHOST[netName]

    const seed = bip39.mnemonicToSeedSync(mnemonic)
    const root = bip32.fromSeed(seed, network.bip32settings)
    const derivePath = bip44.createDerivePath(network)
    const child = root.derivePath(derivePath)

    const libNetwork = ghost_bitcore.Networks.testnet // todo: add mainnet

    const privateKey = new ghost_bitcore.PrivateKey.fromWIF(child.toWIF())
    const publicKey = ghost_bitcore.PublicKey(privateKey, libNetwork)
    const address = new ghost_bitcore.Address(publicKey, libNetwork)

    const account = {
      privateKey,
      publicKey,
      address
    }

    return account
  },

  async createTx({ netName, account, amount, to }) {
    const { privateKey, publicKey, address } = account

    const network = GHOST[netName]
    const addressStr = address.toString()
    const unspent = await connector.fetchUnspents(network.type, addressStr)

    const tx = new ghost_bitcore.Transaction()
      .from(unspent)
      .to(to, amount)  // [sat]
      .change(address)  // Where the rest of the funds will go
      .sign(privateKey) // Signs all the inputs it can

    const rawTx = tx.serialize() // raw tx to broadcast
    return rawTx
  }

}



const connector = {

  getApiUrl(netType) {
    if (netType === networkType.mainnet) {
      return 'https://ghostscan.io/ghost-insight-api'
    }
    if (netType === networkType.testnet) {
      return 'https://testnet.ghostscan.io/ghost-insight-api'
    }
    throw new Error(`Unknown networkType: ${netType}`)
  },

  getTxUrl(netType, txId) {
    if (netType == networkType.mainnet) {
      return `https://ghostscan.io/tx/${txId}`
    }
    if (netType == networkType.testnet) {
      return `https://testnet.ghostscan.io/tx/${txId}`
    }
  },

  async fetchBalance(netType, address) {
    const apiUrl = connector.getApiUrl(netType);
    const response = await fetch(`${apiUrl}/addr/${address}`);
    const json = await response.json();
    /*
    {
      addrStr: 'XPtT4tJWyepGAGRF9DR4AhRkJWB3DEBXT2',
      balance: 0,
      balanceSat: 0,
      totalReceived: 1,
      totalReceivedSat: 100000000,
      totalSent: 1,
      totalSentSat: 100000000,
      unconfirmedBalance: 7,
      unconfirmedBalanceSat: 700000000,
      unconfirmedTxApperances: 7,
      txApperances: 2,
      transactions: [
        '...', '...'
      ]
    }
  */
    return json.balance;
  },

  async fetchUnspents(netType, addr) {
    const apiUrl = connector.getApiUrl(netType);
    const response = await fetch(`${apiUrl}/addr/${addr}/utxo`);

    if (response.status !== 200) {
      throw new Error(`Can't fetch unspents - ${response.status}, ${response.statusText}`)
    }

    /*
    [
      {
        address: 'XPtT4tJWyepGAGRF9DR4AhRkJWB3DEBXT2',
        txid:
     'd919f24224c32288c101bfdc0c787e28bd11c9f6d350be0ce4dc2b242a005dac',
        vout: 0,
        scriptPubKey: '76a91489889acc6e649c88f34cd7e682601d395e0ecef388ac',
        amount: 1,
        satoshis: 100000000,
        confirmations: 0,
        ts: 1598447591
      },
      { .. }
    ]
    */

    json = await response.json();
    return json;
  },

  async fetchTx(txid) {
    /*
    const apiUrl = connector.getApiUrl(network);
    const response = await fetch(`${apiUrl}/tx/${txid}`);
    const json = await response.json();
    return json;
    */
  },

  async fetchRawTx(txid) {
    /*
    const apiUrl = connector.getApiUrl(network);
    const response = await fetch(`${apiUrl}/rawtx/${txid}`);
    const json = await response.json();
    return json;
    */
  },

  async publishRawTx(netType, rawTx) {
    const apiUrl = connector.getApiUrl(netType);
    const response = await fetch(`${apiUrl}/tx/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawtx: rawTx }),
    });
    const json = await response.json();
    return json;
  },

}
