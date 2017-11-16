const EventEmitter = require('events').EventEmitter
const Wallet = require('ethereumjs-wallet')
const ethUtil = require('ethereumjs-util')
const type = 'Simple Key Pair'
const sigUtil = require('eth-sig-util')
const Transaction = require('ethereumjs-tx')

class SimpleKeyring extends EventEmitter {

  /* PUBLIC METHODS */

  constructor (opts) {
    super()
    console.log('hi from mobilemask')
    this.type = type
    this.opts = opts || {}
    this.wallets = []
    // localhost
    this.sdkdConfig = {
      sdkdHost: 'http://localhost:3000',
      sdkdWsHost: 'ws://localhost:3000',
      apiKey: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcGlfY2xpZW50X2lkIjoiNGVkNTNiYTAtNTRjYy00M2QwLTk4MDgtZGZiMTY2ZDhhMmI4IiwiY3JlYXRlZF9hdCI6MTUwNzIzNjQ4OH0.z4_h_4iTCYyv0OMCqe6RE0XEvM_DIagTR3lfRbQt74w',
      currentUserKey: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYWU5YjhmYzgtMDJkNi00ZWZlLWI5NTYtMmM1OGQ4MjUzNDBlIiwiY3JlYXRlZF9hdCI6MTUxMDcxMjEzOX0.NHu2CIGuVVZWOIWbOAPQVnzT3arJmt0JdFBgKaS5phc',
      userId: 'ae9b8fc8-02d6-4efe-b956-2c58d825340e'
    }
  }

  serialize () {
    return Promise.resolve(this.wallets.map(w => w.getPrivateKey().toString('hex')))
  }

  // deserialize (privateKeys = []) {
  //   return new Promise((resolve, reject) => {
  //     try {
  //       this.wallets = privateKeys.map((privateKey) => {
  //         const stripped = ethUtil.stripHexPrefix(privateKey)
  //         const buffer = new Buffer(stripped, 'hex')
  //         const wallet = Wallet.fromPrivateKey(buffer)
  //         return wallet
  //       })
  //     } catch (e) {
  //       reject(e)
  //     }
  //     resolve()
  //   })
  // }

  deserialize () {
    // get from server
    return new Promise((resolve, reject) => {
      fetch(this.sdkdConfig.sdkdHost + '/user_key_parts', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-SDKD-API-Client-Key': this.sdkdConfig.apiKey,
          'X-SDKD-User-Key': this.sdkdConfig.currentUserKey
        }
      })
      .then(response => response.json())
      .then(response => {
        // response is an array of hex encoded eth addresse that belong to the user
        this.wallets = response
        resolve()
      })
    })
  }

  // addAccounts (n = 1) {
  //   var newWallets = []
  //   for (var i = 0; i < n; i++) {
  //     newWallets.push(Wallet.generate())
  //   }
  //   this.wallets = this.wallets.concat(newWallets)
  //   const hexWallets = newWallets.map(w => ethUtil.bufferToHex(w.getAddress()))
  //   return Promise.resolve(hexWallets)
  // }

  addAccounts () {
    console.log('called add accounts.  uhhhh')
  }

  getAccounts () {
    return Promise.resolve(this.wallets)
  }

  // tx is an instance of the ethereumjs-transaction class.
  signTransaction (address, tx) {
    console.log('signing transaction for address: ' + address)
    console.log(tx)
    // original implementation:
    // const wallet = this._getWalletForAccount(address)
    // var privKey = wallet.getPrivateKey()
    // tx.sign(privKey)
    // return Promise.resolve(tx)

    return new Promise((resolve, reject) => {
      let wsUri = this.sdkdConfig.sdkdWsHost + '/cable'
      let websocket = new WebSocket(wsUri)
      websocket.onopen = (evt) => {
        console.log(evt)
        console.log("CONNECTED")

        // subscribe
        let identifier = {
          channel: "MessagesChannel",
          user_id: this.sdkdConfig.userId
        }
        let msg = {
          command: "subscribe",
          identifier: JSON.stringify(identifier)
        }
        websocket.send(JSON.stringify(msg))

        // send txn
        let data = {
          action: 'create_tx',
          tx_params: tx
        }
        msg = {
          command: "message",
          identifier: JSON.stringify(identifier),
          data: JSON.stringify(data)
        }
        websocket.send(JSON.stringify(msg))
      }
      websocket.onclose = (evt) => { console.log(evt) }
      websocket.onerror = (evt) => { console.log(evt) }
      websocket.onmessage = (evt) => {
        let data = JSON.parse(evt.data)
        if (data.type == 'ping') {
          return // don't print pings
        }
        console.log(evt)
        if (data.message && data.message.tx) {
          console.log('signed tx is included')
          websocket.close()
          let signedTx = data.message.tx
          tx = new Transaction(signedTx.signed_tx)
          console.log('signed tx: ')
          console.log(JSON.stringify(tx))
          resolve(tx)
        }
      }
    })
  }

  // For eth_sign, we need to sign arbitrary data:
  signMessage (withAccount, data) {
    const wallet = this._getWalletForAccount(withAccount)
    const message = ethUtil.stripHexPrefix(data)
    var privKey = wallet.getPrivateKey()
    var msgSig = ethUtil.ecsign(new Buffer(message, 'hex'), privKey)
    var rawMsgSig = ethUtil.bufferToHex(sigUtil.concatSig(msgSig.v, msgSig.r, msgSig.s))
    return Promise.resolve(rawMsgSig)
  }

  // For personal_sign, we need to prefix the message:
  signPersonalMessage (withAccount, msgHex) {
    const wallet = this._getWalletForAccount(withAccount)
    const privKey = ethUtil.stripHexPrefix(wallet.getPrivateKey())
    const privKeyBuffer = new Buffer(privKey, 'hex')
    const sig = sigUtil.personalSign(privKeyBuffer, { data: msgHex })
    return Promise.resolve(sig)
  }

  // personal_signTypedData, signs data along with the schema
  signTypedData (withAccount, typedData) {
    const wallet = this._getWalletForAccount(withAccount)
    const privKey = ethUtil.toBuffer(wallet.getPrivateKey())
    const sig = sigUtil.signTypedData(privKey, { data: typedData })
    return Promise.resolve(sig)
  }

  // exportAccount should return a hex-encoded private key:
  exportAccount (address) {
    const wallet = this._getWalletForAccount(address)
    return Promise.resolve(wallet.getPrivateKey().toString('hex'))
  }


  /* PRIVATE METHODS */

  _getWalletForAccount (account) {
    const address = sigUtil.normalize(account)
    let wallet = this.wallets.find(w => ethUtil.bufferToHex(w.getAddress()) === address)
    if (!wallet) throw new Error('Simple Keyring - Unable to find matching address.')
    return wallet
  }

}

SimpleKeyring.type = type
module.exports = SimpleKeyring
