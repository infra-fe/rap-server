import router from './router'
import ProxyService from '../service/proxy'

/**
 * 代理restful服务
 */
router.all('/proxy/restful', async (ctx) => {
  const { target = '' } = ctx.query
  const { method, headers, body } = ctx.request

  const url = decodeURIComponent(target as string)

  // console.log('ldt-node-proxy-axios-request:', { target, url }, { method, headers, body })

  try {
    const response = await ProxyService.axios(url, {
      method,
      headers,
      body,
    })

    const {
      status, statusText, data,
      // headers: resHeaders,
    } = response

    // if (resHeaders) {
    //   const keys = Object.keys(resHeaders)
    //   keys.forEach((key) => {
    //     ctx.set(key, resHeaders[key])
    //   })
    // }

    ctx.status = status
    ctx.body = data
    ctx.statusText = statusText
  } catch (error) {
    ctx.status = 502
    ctx.body = `Proxy Server Error. ${error.message}`
  }
})
