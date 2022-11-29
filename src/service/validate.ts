import { convert } from 'curl-to-postmanv2'

export interface IGetCurlParamsResult {
  isCover?: boolean
  url: string
  name: string
  method: string
  hostname: string
  port: string
  pathname: string
  protocol: string
  description: string
  header: Array<{
    key: string
    value: string
  }>
  headers: {
    [key: string]: string
  }
  query: {
    [key: string]: string | string[]
  }
  body: {
    mode?: string
    raw?: string
    formdata?: string
    urlencoded?: string
    [key: string]: string
  }
}
interface IConvertCallbackResult {
  result: boolean
  reason?: string
  output?: Array<{
    type: 'request'
    data: IGetCurlParamsResult
  }>
}

const HeaderIgnore = /(^sec-)|origin|referer|host|cookie|user-agent/i

export default class ValidateService {
  public static convertCURL(curl: string) {
    if (!curl) {
      return null
    }

    if (curl.toLowerCase().indexOf('curl') !== 0) {
      curl = `curl '${curl}'`
    }

    return convert({ type: 'string', data: curl }, (error: unknown, callbackResult: IConvertCallbackResult) => {
      if (error || !callbackResult?.result) {
        return null
      }

      let result = callbackResult?.output?.[0]?.data
      if (!result) {
        return null
      }

      if (result?.url) {
        try {
          const { hostname, port, pathname, protocol, searchParams } = new URL(result.url)

          const query = {}
          searchParams.forEach((value, key) => {
            query[key] = value
          })

          result = {
            ...result,
            hostname,
            port,
            pathname,
            protocol: protocol.split(':')[0],
            query,
          }
        } catch (e) {
          // eslint-disable-line
        }
      }

      if (result?.header?.length) {
        result.header = result.header.filter(item => !HeaderIgnore.test(item.key))

        const headerMap = {}
        result.header.forEach(({ key, value }) => {
          headerMap[key] = value
        })

        result.headers = headerMap
      }

      return result
    })
  }
}
