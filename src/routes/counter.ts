import router from './router'
import config from '../config'
import CounterService from '../service/counter'

router.get('/app/counter', async (ctx) => {
  const app = ctx.app
  const mockNum = await CounterService.getTotal()

  ctx.body = {
    data: {
      version: config.version,
      users: Object.keys(app.counter.users).length,
      mock: mockNum,
    },
  }
})
