import express, { Request, Response } from 'express'
const router = express.Router()

router.get('/chat/update', async (req: Request, res: Response) => {
  res.send('databases')
})

export default router
