import express, { Router } from 'express'
// import Stripe from 'stripe'
// import config from '../config/config'

const router = Router()
//const stripe = new Stripe(config.STRIPE_KEY)

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event = req.body
  // Only verify the event if you have an endpoint secret defined.
  // Otherwise use the basic event deserialized with JSON.parse
  //   if (endpointSecret) {
  //     // Get the signature sent by Stripe
  //     const signature = req.headers['stripe-signature']
  //     try {
  //       event = stripe.webhooks.constructEvent(req.body, signature, endpointSecret)
  //     } catch (err: any) {
  //       console.log(`⚠️  Webhook signature verification failed.`, err.message)
  //       return res.sendStatus(400)
  //     }
  //   }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object
      console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`)
      break
    default:
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}.`)
      console.log(JSON.stringify(event, null, 2))
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send()
})

export default router
