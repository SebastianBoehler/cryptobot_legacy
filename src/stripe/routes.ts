import express, { Router } from 'express'
import Stripe from 'stripe'
import config from '../config/config'
import MongoWrapper from '../mongodb'
import { logger } from '../utils'

const mongo = new MongoWrapper('users')
// await mongo.updateUserProfile('email', {})

const router = Router()
const stripe = new Stripe(config.STRIPE_KEY)

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event = req.body

  logger.debug('[stripe] webhook received', event)
  console.log('[stripe] event', JSON.stringify(event, null, 2))

  // Function to get email from Stripe API using customer ID
  const getEmailFromCustomerId = async (customerId: string): Promise<string | null> => {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if ('email' in customer && customer.email) {
        return customer.email
      }
    } catch (error) {
      console.error('Error fetching customer:', error)
    }
    return null
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object
      console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`)
      if (paymentIntent.customer) {
        const email = await getEmailFromCustomerId(paymentIntent.customer as string)
        console.log(`Associated email: ${email}`)
      }
      break

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const items = subscription.items.data
      const planId = items.length > 0 ? items[0].plan.id : null
      const email = await getEmailFromCustomerId(customerId)
      console.log('subscription event', email, planId)

      if (planId && email) {
        try {
          // Update the user's plan in the database
          await mongo.updateUserProfile(email, { plan: subscription.status })
          console.log(`User with customer ID ${customerId} updated with plan ${subscription.status}.`)
        } catch (dbError) {
          console.error(`Failed to update user with customer ID ${customerId}:`, dbError)
          return res.sendStatus(500)
        }
      } else {
        console.warn(`No plan ID or email found for subscription ${subscription.id}.`)
      }
      break

    default:
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}.`)
      if (event.data?.object?.customer) {
        const email = await getEmailFromCustomerId(event.data.object.customer as string)
        console.log(`Associated email for unhandled event: ${email}`)
      }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.sendStatus(200)
})

export default router
