import express, { Request, Response } from 'express'
import MongoWrapper from '../mongodb'
const router = express.Router()
const mongo = new MongoWrapper('sec_data')

router.post('/reports', async (req: Request, res: Response) => {
  const { CIK } = req.body

  const reports = await mongo.loadSECReports(CIK)

  res.json(reports)
})

export default router
