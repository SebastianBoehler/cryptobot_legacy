const web3 = require('@solana/web3.js')

/**
 * Check if a transaction is finalized on Solana DevNet.
 * @param {string} transactionHash - The transaction hash to check.
 * @returns {Promise<boolean>} - A promise that resolves to true if the transaction is finalized, false otherwise.
 */
export async function isTransactionFinalized(transactionHash: string) {
  const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed')

  try {
    const status = await connection.getSignatureStatus(transactionHash)

    if (status && status.value) {
      return status.value.confirmationStatus === 'finalized'
    } else {
      return false
    }
  } catch (error) {
    console.error('Error checking transaction status:', error)
    return false
  }
}
