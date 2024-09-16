import express, { Router } from 'express'
import Stripe from 'stripe'
import config from '../config/config'

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
    // case 'account.updated':
    //   //const accountUpdated = event.data.object
    //   // Then define and call a function to handle the event account.updated
    //   break
    // case 'customer.created':
    //   // Then define and call a function to handle the event customer.created
    //   break
    // case 'customer.updated':
    //   // Then define and call a function to handle the event customer.updated
    //   break
    // case 'customer.subscription.created':
    //   // Then define and call a function to handle the event customer.subscription.created
    //   break
    // case 'customer.subscription.deleted':
    //   // Then define and call a function to handle the event customer.subscription.deleted
    //   break
    // case 'customer.subscription.paused':
    //   // Then define and call a function to handle the event customer.subscription.paused
    //   break
    // case 'customer.subscription.pending_update_applied':
    //   // Then define and call a function to handle the event customer.subscription.pending_update_applied
    //   break
    // case 'customer.subscription.pending_update_expired':
    //   // Then define and call a function to handle the event customer.subscription.pending_update_expired
    //   break
    // case 'customer.subscription.resumed':
    //   // Then define and call a function to handle the event customer.subscription.resumed
    //   break
    // case 'customer.subscription.updated':
    //   // Then define and call a function to handle the event customer.subscription.updated
    //   break
    default:
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}.`)
      console.log(JSON.stringify(event, null, 2))
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send().status(200)
})

export default router
