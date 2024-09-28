import express, { Router } from 'express'
import Stripe from 'stripe'
import config from '../config/config'
import MongoWrapper from '../mongodb'

const mongo = new MongoWrapper('users')
// await mongo.updateUserProfile('email', {})

const router = Router()
const stripe = new Stripe(config.STRIPE_KEY)

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event = req.body
  // Only verify the event if you have an endpoint secret defined.
  // Otherwise use the basic event deserialized with JSON.parse
  const signature = req.headers['stripe-signature'] || ''
  const endpointSecret = 'whsec_JMjXwmg3eGbJ6kOTGqKAt18Vf6YXsehh'

  try {
    console.log(typeof event, event, signature)
    event = stripe.webhooks.constructEvent(req.body.toString(), signature, endpointSecret)
  } catch (err: any) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message)
    return res.sendStatus(400)
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object
      console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`)
      break

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const items = subscription.items.data
      const planId = items.length > 0 ? items[0].plan.id : null
      const email = subscription.metadata.email
      console.log('subscription event', email, planId)

      if (planId) {
        try {
          // Update the user's plan in the database
          await mongo.updateUserProfile(email, { plan: planId })
          console.log(`User with customer ID ${customerId} updated with plan ${planId}.`)
        } catch (dbError) {
          console.error(`Failed to update user with customer ID ${customerId}:`, dbError)
          return res.sendStatus(500)
        }
      } else {
        console.warn(`No plan ID found for subscription ${subscription.id}.`)
      }
      break

    default:
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}.`)
      console.log(JSON.stringify(event, null, 2))
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send().status(200)
})

export default router
