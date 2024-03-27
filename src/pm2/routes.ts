import pm2 from 'pm2'

import express, { Request, Response } from 'express'
import { logger } from '../utils'
import { differenceInMinutes } from 'date-fns'
const router = express.Router()

router.get('/status', async (req: Request, res: Response) => {
  pm2.list((err, data) => {
    if (err) {
      logger.error(err)
      res.status(500).send({
        message: 'Internal Server Error',
      })
      return
    }

    const mapped = data.map((item) => ({
      name: item.name,
      pid: item.pid,
      status: item.pm2_env?.status,
      uptime: differenceInMinutes(new Date(), new Date(item.pm2_env?.pm_uptime || 0)),
      restarts: item.pm2_env?.restart_time,
      memory: item.monit?.memory,
      cpu: item.monit?.cpu,
    }))
    res.status(200).send({
      data: mapped,
    })
  })
})

export default router
