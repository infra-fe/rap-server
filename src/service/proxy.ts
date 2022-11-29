import axios, { AxiosRequestConfig, AxiosRequestHeaders, Method } from 'axios'
import { IncomingHttpHeaders } from 'http'
import { merge } from 'lodash'
import https = require('https')

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

const axiosConfig: AxiosRequestConfig = {
  // `validateStatus` 定义对于给定的HTTP 响应状态码是 resolve 或 reject  promise 。
  // 如果 `validateStatus` 返回 `true` (或者设置为 `null` 或 `undefined`)，promise 将被 resolve; 否则，promise 将被 rejecte
  validateStatus: (status: number) => {
    // 允许[200,600)的状态码通过，在调用逻辑里拦截
    return status >= 200 && status < 600
  },

  // 请求第三方接口的超时设置
  timeout: 30 * 1000,

  // 设置request的body最大值（4M）
  maxBodyLength: 4 * 1024 * 1024,

  // 设置response返回最大值（4M），单位byte
  maxContentLength: 4 * 1024 * 1024,
}

function getAxiosMethod(method: string): Method {
  if (['get', 'delete', 'head', 'options', 'post', 'put', 'patch'].includes(method?.toLowerCase())) {
    return method as Method
  }

  return 'get'
}

const ignoreHosts = ['localhost', '127.0.0.1', '::1']
function refuseHost(url: string): boolean {
  if (!url) {
    return true
  }

  return ignoreHosts.some((host) => {
    return url.indexOf(host) >= 0
  })
}

const DefaultOverrideHeaders: IncomingHttpHeaders = {
  host: '',
  origin: '',
  referer: '',
}
function adaptProxyHeaders(headers: IncomingHttpHeaders, overrideHeaders?: IncomingHttpHeaders): AxiosRequestHeaders {
  if (!headers) {
    return null
  }

  const proxyHeaders: AxiosRequestHeaders = {}
  merge(proxyHeaders, headers, DefaultOverrideHeaders, overrideHeaders || {})

  return proxyHeaders
}

export type AxiosParamsType = {
  method: string
  headers: IncomingHttpHeaders
  body?: AxiosRequestConfig['data']
}

export default class ProxyService {
  public static async axios(url: string, params?: AxiosParamsType) {
    if (refuseHost(url)) {
      throw new Error('Domain or IP is ignored. Please try again without proxy.')
    }

    const { method, headers, body } = params || {}

    const isHttps = url.toLowerCase().indexOf('https') === 0
    const axiosMethod = getAxiosMethod(method)

    return await axios({
      ...axiosConfig,
      httpsAgent: isHttps ? httpsAgent : null,
      url,
      method: axiosMethod,
      headers: adaptProxyHeaders(headers),
      data: body,
    })
  }
}
