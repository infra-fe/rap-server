import * as schedule from 'node-schedule'
import { Interface } from '../models'
import { Op } from 'sequelize'
import { DATE_CONST } from '../routes/utils/const'

import CounterService from './counter'

export async function startTask() {

  console.log(`Starting task: locker check`)

  /**
   * 每5分钟检查lock超时、同步counter
   */
  schedule.scheduleJob('*/5 * * * *', async () => {
    // tslint:disable-next-line: no-null-keyword
    const [num] = await Interface.update({ lockerId: null }, {
      where: {
        lockerId: {
          [Op.gt]: 0,
        },
        updatedAt: {
          [Op.lt]: new Date(Date.now() - DATE_CONST.DAY),
        },
      },
    })

    num > 0 && console.log(`cleared ${num} locks`)

    // sync counter
    try {
      CounterService.asyncSaveMockNum()
    } catch (e) {
      console.error('mock counter save error:', e)
    }
  })
}
