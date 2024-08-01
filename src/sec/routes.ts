import express, { Request, Response } from 'express'
import MongoWrapper from '../mongodb'
const router = express.Router()
const mongo = new MongoWrapper('sec_data')

router.post('/reports', async (req: Request, res: Response) => {
  const { CIK, after, forms } = req.body

  const reports = await mongo.loadSECReports(CIK, after, forms)

  res.json(reports)
})

export default router
