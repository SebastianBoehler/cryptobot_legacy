import * as anchor from '@coral-xyz/anchor'
import { HbCapitalSmartcontract } from './idl'
import { logger } from '../utils'
import { getUnixTime } from 'date-fns'
import { CloseOrder, Order, TraderAction } from 'cryptobot-types'
import { IOrderHelperPos } from '../types'
import fs from 'fs'
import path from 'path'
import MongoWrapper from '../mongodb'
import config from '../config/config'
// Load the environment variables from .env file
require('dotenv').config()
const mongo = new MongoWrapper('trader')

// Hard-coded provider and wallet setup
const connection = new anchor.web3.Connection('https://api.devnet.solana.com') // Replace with your network endpoint

// Convert the secret key from environment variable to Uint8Array
const secretKeyArray = new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, '/my-new-keypair.json'), 'utf8')))
const keypair = anchor.web3.Keypair.fromSecretKey(secretKeyArray)
const wallet = new anchor.Wallet(keypair)
const provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions())
anchor.setProvider(provider)

const signer = wallet.payer
logger.debug('Signer:', signer.publicKey.toBase58())

// Ensure to load the correct Program ID and IDL
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, '/idl.json'), 'utf8'))
const program = new anchor.Program<HbCapitalSmartcontract>(idl, provider)

const initializePda = async (pos: IOrderHelperPos, id: string) => {
  if (config.NODE_ENV === 'prod' || config.NODE_ENV === 'test') return
  const ticker = pos.symbol
  const side = pos.type === 'long' ? 0 : 1

  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      anchor.utils.bytes.utf8.encode(id),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  console.log(id)
  console.log('PDA:', posPDA.toBase58())

  const bump = 6
  const tx = await program.methods
    .initialize(ticker, side, id, bump)
    .accounts({
      signer: signer.publicKey,
      //@ts-ignore
      position: posPDA,
    })
    .rpc()

  logger.debug('Initialize pos pda tx:', tx)

  //await mongo.addFields('livePositions', { txHash: tx }, { symbol: pos.symbol, posId: pos.posId })
}

const addAction = async (action: TraderAction, id: string) => {
  if (config.NODE_ENV === 'prod') return
  const ticker = action.symbol + action.posId
  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      anchor.utils.bytes.utf8.encode(id),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  const action_type = action.action.includes('margin') ? 0 : 1
  const time = new anchor.BN(getUnixTime(new Date()))
  const setTo = new anchor.BN(action.after)

  const tx = await program.methods
    .addAction(ticker, id, action_type, time, setTo)
    .accounts({
      signer: signer.publicKey,
      //@ts-ignore
      position: posPDA,
    })
    .rpc()

  logger.debug('Add action tx:', tx)

  await mongo.addFields('actions', { txHash: tx }, { posId: action.posId, time: action.time })
}

const addOrder = async (order: Order | CloseOrder, id: string) => {
  if (config.NODE_ENV === 'prod') return
  const ticker = order.symbol + order.posId
  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      anchor.utils.bytes.utf8.encode(id),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )
  const time = new anchor.BN(getUnixTime(new Date()))
  const orderType = order.action === 'open' ? 0 : 1
  const price = new anchor.BN(order.avgPrice)
  const size = new anchor.BN(order.size)

  const tx = await program.methods
    .addOrder(ticker, id, orderType, price, time, size)
    .accounts({
      signer: signer.publicKey,
      //@ts-ignore
      position: posPDA,
    })
    .rpc()

  logger.debug('Add order tx:', tx)

  await mongo.addFields('orders', { txHash: tx }, { posId: order.posId, time: order.time })
}

const doesPdaExist = async (ticker: string, id: string) => {
  const [posPDA, _bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode('pos'),
      anchor.utils.bytes.utf8.encode(ticker),
      anchor.utils.bytes.utf8.encode(id),
      signer.publicKey.toBuffer(),
    ],
    program.programId
  )

  const pda = await program.account.position.fetch(posPDA)
  logger.debug('PDA:', !!pda, pda)

  return !!pda
}

//@ts-ignore
initializePda({ symbol: 'BTC-test', type: 'long' }, '2´')
// @ts-ignore
// addAction({ symbol: 'BTC-test', action: 'margin change', after: 23 })
// @ts-ignore
// addOrder({ symbol: 'BTC-test', action: 'open', avgPrice: 100, size: 100 })

export { initializePda, addAction, addOrder, doesPdaExist }
