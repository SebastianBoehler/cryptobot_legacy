import * as anchor from '@coral-xyz/anchor'
import { HbCapitalSmartcontract } from './idl'
import { logger, sleep } from '../utils'
import { differenceInSeconds, getUnixTime } from 'date-fns'
import { CloseOrder, Order, TraderAction } from 'cryptobot-types'
import { IOrderHelperPos } from '../types'
import MongoWrapper from '../mongodb'
import config from '../config/config'
import { isTransactionFinalized } from './helper'
// Load the environment variables from .env file
require('dotenv').config()
const mongo = new MongoWrapper('trader')

// Hard-coded provider and wallet setup
const connection = new anchor.web3.Connection('https://api.devnet.solana.com') // Replace with your network endpoint

// Convert the secret key from environment variable to Uint8Array

const secretKeyArray = new Uint8Array([
  184, 249, 65, 241, 48, 85, 24, 236, 131, 170, 161, 151, 101, 1, 19, 181, 166, 37, 14, 174, 7, 70, 136, 182, 178, 196,
  113, 206, 164, 139, 211, 128, 222, 186, 217, 155, 46, 95, 253, 252, 71, 193, 15, 60, 54, 223, 143, 231, 128, 149, 130,
  230, 11, 81, 99, 123, 128, 128, 47, 106, 133, 248, 107, 238,
])
const keypair = anchor.web3.Keypair.fromSecretKey(secretKeyArray)
const wallet = new anchor.Wallet(keypair)
const provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions())
anchor.setProvider(provider)

const signer = wallet.payer
logger.debug('[solana] signer:', signer.publicKey.toBase58())

const idl = {
  address: '8SPueaEQmPzs9rHUEv789r1P89zq7e4fWnQmCnKXTdEV',
  metadata: {
    name: 'hb_capital_smartcontract',
    version: '0.1.1',
    spec: '0.1.0',
    description: 'Making our transactions more transparent and easy verifiable',
  },
  instructions: [
    {
      name: 'add_action',
      discriminator: [96, 90, 68, 182, 95, 52, 192, 101],
      accounts: [
        {
          name: 'signer',
          writable: true,
          signer: true,
        },
        {
          name: 'position',
          writable: true,
          pda: {
            seeds: [
              {
                kind: 'const',
                value: [112, 111, 115],
              },
              {
                kind: 'arg',
                path: 'ticker',
              },
              {
                kind: 'arg',
                path: 'id',
              },
              {
                kind: 'account',
                path: 'signer',
              },
            ],
          },
        },
      ],
      args: [
        {
          name: '_ticker',
          type: 'string',
        },
        {
          name: '_id',
          type: 'u64',
        },
        {
          name: 'action_type',
          type: 'u8',
        },
        {
          name: 'time',
          type: 'i64',
        },
        {
          name: 'set_to',
          type: 'u64',
        },
      ],
    },
    {
      name: 'add_order',
      discriminator: [119, 178, 239, 1, 189, 29, 253, 254],
      accounts: [
        {
          name: 'signer',
          writable: true,
          signer: true,
        },
        {
          name: 'position',
          writable: true,
          pda: {
            seeds: [
              {
                kind: 'const',
                value: [112, 111, 115],
              },
              {
                kind: 'arg',
                path: 'ticker',
              },
              {
                kind: 'arg',
                path: 'id',
              },
              {
                kind: 'account',
                path: 'signer',
              },
            ],
          },
        },
      ],
      args: [
        {
          name: '_ticker',
          type: 'string',
        },
        {
          name: '_id',
          type: 'u64',
        },
        {
          name: 'order_type',
          type: 'u8',
        },
        {
          name: 'price',
          type: 'u64',
        },
        {
          name: 'size',
          type: 'u64',
        },
      ],
    },
    {
      name: 'initialize',
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        {
          name: 'signer',
          writable: true,
          signer: true,
        },
        {
          name: 'position',
          writable: true,
          pda: {
            seeds: [
              {
                kind: 'const',
                value: [112, 111, 115],
              },
              {
                kind: 'arg',
                path: 'ticker',
              },
              {
                kind: 'arg',
                path: 'id',
              },
              {
                kind: 'account',
                path: 'signer',
              },
            ],
          },
        },
        {
          name: 'system_program',
          address: '11111111111111111111111111111111',
        },
      ],
      args: [
        {
          name: 'ticker',
          type: 'string',
        },
        {
          name: '_id',
          type: 'u64',
        },
        {
          name: 'side',
          type: 'u8',
        },
        {
          name: '_bump',
          type: 'u8',
        },
      ],
    },
  ],
  accounts: [
    {
      name: 'Position',
      discriminator: [170, 188, 143, 228, 122, 64, 247, 208],
    },
  ],
  errors: [
    {
      code: 6000,
      name: 'Unathorized',
      msg: 'Unauthorized',
    },
  ],
  types: [
    {
      name: 'Action',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'action_type',
            type: 'u8',
          },
          {
            name: 'time',
            type: 'i64',
          },
          {
            name: 'set_to',
            type: 'u64',
          },
        ],
      },
    },
    {
      name: 'Order',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'order_type',
            type: 'u8',
          },
          {
            name: 'price',
            type: 'u64',
          },
          {
            name: 'size',
            type: 'u64',
          },
        ],
      },
    },
    {
      name: 'Position',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'ticker',
            type: 'string',
          },
          {
            name: 'side',
            type: 'u8',
          },
          {
            name: 'actions',
            type: {
              vec: {
                defined: {
                  name: 'Action',
                },
              },
            },
          },
          {
            name: 'orders',
            type: {
              vec: {
                defined: {
                  name: 'Order',
                },
              },
            },
          },
        ],
      },
    },
  ],
}

// @ts-ignore
const program = new anchor.Program<HbCapitalSmartcontract>(idl, provider)

const initializePda = async (pos: IOrderHelperPos, id: number) => {
  if (config.NODE_ENV === 'test') return
  const ticker = pos.symbol
  const side = pos.type === 'long' ? 0 : 1

  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(id)]).buffer)), // Correct conversion of u64 to bytes
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  console.log(id)
  console.log('PDA:', posPDA.toBase58())

  //bump random u8
  const bump = Math.floor(Math.random() * 255)

  const tx = await program.methods
    .initialize(ticker, new anchor.BN(id), side, bump)
    .accounts({
      signer: signer.publicKey,
      //@ts-ignore
      position: posPDA,
    })
    .rpc()
    .catch((e) => {
      logger.error('[solana] Error initializing pda:', e)
      return null
    })

  logger.debug('[solana] Initialize pos pda tx:', tx)
  if (!tx) return

  //await mongo.addFields('livePositions', { txHash: tx }, { symbol: pos.symbol, posId: pos.posId })

  const start = Date.now()
  while (true) {
    await sleep(1000)
    const finalized = await isTransactionFinalized(tx)
    if (finalized) break
    if (differenceInSeconds(start, Date.now()) > 20) break
  }

  logger.debug('[solana] transaction finalized')
}

const addAction = async (action: TraderAction, id: number) => {
  if (!doesPdaExist(action.symbol, id)) {
    logger.error('[solana] PDA does not exist for action')
    return
  }
  const ticker = action.symbol
  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(id)]).buffer)),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  logger.debug('[solana] pda address', posPDA.toBase58())

  const action_type = action.action.includes('margin') ? 0 : 1
  const time = new anchor.BN(getUnixTime(new Date()))
  const setTo = new anchor.BN(action.after)

  const tx = await program.methods
    .addAction(ticker, new anchor.BN(id), action_type, time, setTo)
    .accounts({
      signer: signer.publicKey,
      //@ts-ignore
      position: posPDA,
    })
    .rpc()

  logger.debug('[solana] Add action tx:', tx)

  await mongo.addFields('actions', { txHash: tx }, { posId: action.posId, time: action.time })
}

const addOrder = async (order: Order | CloseOrder, id: number) => {
  if (!doesPdaExist(order.symbol, id)) {
    logger.error('[solana] PDA does not exist for order:', order)
    return
  }
  const ticker = order.symbol
  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(id)]).buffer)),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  logger.debug('[solana > add order] pda address', posPDA.toBase58())

  const orderType = order.action === 'open' ? 0 : 1
  const price = new anchor.BN(order.avgPrice)
  const size = new anchor.BN(order.size)

  const tx = await program.methods
    .addOrder(ticker, new anchor.BN(id), orderType, price, size)
    .accounts({
      signer: signer.publicKey,
      //@ts-ignore
      position: posPDA,
    })
    .rpc()

  logger.debug('[solana] Add order tx:', tx)

  await mongo.addFields('orders', { txHash: tx }, { posId: order.posId, time: order.time })
}

const doesPdaExist = async (ticker: string, id: number) => {
  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(id)]).buffer)),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  logger.debug('pda address', posPDA.toBase58())

  const pda = await program.account.position.fetch(posPDA).catch((err) => {
    logger.error('Error fetching pda:', err)
    return null
  })
  logger.debug('[solana] does pda exist:', !!pda)

  return !!pda
}

// @ts-ignore
// initializePda({ symbol: 'BTC-USDT-SWAP', type: 'long' }, 42)
// @ts-ignore
// addAction({ symbol: 'BTC-test', action: 'margin change', after: 23 })
// @ts-ignore
// addOrder({ symbol: 'BTC-test', action: 'open', avgPrice: 100, size: 100 })

export { initializePda, addAction, addOrder, doesPdaExist }
