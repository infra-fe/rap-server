import ValidateService from '../service/validate'
import router from './router'

/**
 * 把cURL或URL转化为JSON
 */
router.post('/validate/convertCURL', (ctx) => {
  const { curl } = ctx.request.body || {}

  const result = ValidateService.convertCURL(curl)

  ctx.body = {
    data: result,
  }
})
