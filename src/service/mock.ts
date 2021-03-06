import { Repository, Interface, Property, DefaultVal, Scene } from '../models'
import { Op } from 'sequelize'
import * as JSON5 from 'json5'
import urlUtils from '../routes/utils/url'
import Tree from '../routes/utils/tree'
import * as urlPkg from 'url'
import * as querystring from 'querystring'

import CounterService from './counter'

const REG_URL_METHOD = /^\/?(get|post|delete|put)\//i
const attributes: any = { exclude: [] }

export class MockService {
  public static async mock(ctx: any, option: { forceVerify: boolean } = { forceVerify: false }) {
    const { forceVerify } = option
    await CounterService.count()
    let { repositoryId, url } = ctx.params
    let method = ctx.request.method
    repositoryId = +repositoryId
    if (REG_URL_METHOD.test(url)) {
      REG_URL_METHOD.lastIndex = -1
      method = REG_URL_METHOD.exec(url)[1].toUpperCase()
      REG_URL_METHOD.lastIndex = -1
      url = url.replace(REG_URL_METHOD, '')
    }

    const urlWithoutPrefixSlash = /(\/)?(.*)/.exec(url)[2]

    const repository = await Repository.findByPk(repositoryId)
    const collaborators: Repository[] = (await repository.$get('collaborators')) as Repository[]
    let itf: Interface

    let matchedItfList = await Interface.findAll({
      attributes,
      where: {
        repositoryId: [repositoryId, ...collaborators.map(item => item.id)],
        ...(forceVerify ? { method } : {}),
        url: {
          [Op.like]: `%${urlWithoutPrefixSlash}%`,
        },
      },
    })

    function getRelativeURLWithoutParams(url: string) {
      if (url.indexOf('http://') > -1) {
        url = url.substring('http://'.length)
      }
      if (url.indexOf('https://') > -1) {
        url = url.substring('https://'.length)
      }
      if (url.indexOf('/') > -1) {
        url = url.substring(url.indexOf('/') + 1)
      }
      if (url.indexOf('?') > -1) {
        url = url.substring(0, url.indexOf('?'))
      }
      return url
    }

    // matching by path
    if (matchedItfList.length > 1) {
      matchedItfList = matchedItfList.filter(x => {
        const urlDoc = getRelativeURLWithoutParams(x.url)
        const urlRequest = urlWithoutPrefixSlash
        return urlDoc === urlRequest
      })
    }

    // matching by params
    if (matchedItfList.length > 1) {
      const params = {
        ...ctx.request.query,
        ...ctx.request.body,
      }
      const paramsKeysCnt = Object.keys(params).length
      matchedItfList = matchedItfList.filter(x => {
        const parsedUrl = urlPkg.parse(x.url)
        const pairs = parsedUrl.query ? parsedUrl.query.split('&').map(x => x.split('=')) : []
        // ???????????????????????????????????????????????????
        if (pairs.length === 0) {
          return paramsKeysCnt === 0
        }
        // ??????????????????????????????????????????????????????
        for (const p of pairs) {
          const key = p[0]
          const val = p[1]
          if (params[key] !== val) {
            return false
          }
        }
        return true
      })
    }

    // ??????????????????????????????????????????????????????
    if (matchedItfList.length > 1) {
      const currProjMatchedItfList = matchedItfList.filter(x => x.repositoryId === repositoryId)
      // ??????????????????????????????????????????????????????????????????
      if (currProjMatchedItfList.length > 0) {
        matchedItfList = currProjMatchedItfList
      }
    }

    for (const item of matchedItfList) {
      itf = item
      let url = item.url
      if (url.charAt(0) === '/') {
        url = url.substring(1)
      }
      if (url === urlWithoutPrefixSlash) {
        break
      }
    }

    if (!itf) {
      // try RESTFul API search...
      const list = await Interface.findAll({
        attributes: ['id', 'url', 'method'],
        where: {
          repositoryId: [repositoryId, ...collaborators.map(item => item.id)],
          method,
        },
      })

      const listMatched = []
      const relativeUrl = urlUtils.getRelative(url)

      for (const item of list) {
        const regExp = urlUtils.getUrlPattern(item.url) // ????????????????????????
        if (regExp.test(relativeUrl)) {
          // ????????????????????????
          const regMatchLength = regExp.exec(relativeUrl).length // ??????????????????
          if (listMatched[regMatchLength]) {
            // ???????????????????????????????????????group???????????????
            ctx.body = {
              isOk: false,
              errMsg: '??????????????????????????????????????????????????????????????????????????????',
            }
            return
          }
          listMatched[regMatchLength] = item // ????????????
        }
      }

      let loadDataId = 0
      if (listMatched.length > 1) {
        for (const matchedItem of listMatched) {
          // ????????????????????????
          if (matchedItem) {
            // ?????????????????????
            loadDataId = matchedItem.id // ??????????????????id
            break
          }
        }
      } else if (listMatched.length === 0) {
        ctx.body = { isOk: false, errMsg: '???????????????????????????????????????????????????????????????' }
        ctx.status = 404
        return
      } else {
        loadDataId = listMatched[0].id
      }

      itf = itf = await Interface.findByPk(loadDataId)
    }

    const interfaceId = itf.id
    // match scene mode
    const { __scene = '' } = { ...ctx.params, ...ctx.query, ...ctx.request.body }
    if (__scene) {
      const scenes = await Scene.findAll({
        where: { sceneKey: __scene, interfaceId, deletedAt: null },
      })
      const sceneData = scenes?.[0]?.sceneData ?? '{}'
      ctx.body = JSON5.parse(sceneData)
      return
    }

    let properties = await Property.findAll({
      attributes,
      where: { interfaceId, scope: 'response' },
    })

    // default values override
    const defaultVals = await DefaultVal.findAll({ where: { repositoryId } })
    const defaultValsMap: { [key: string]: DefaultVal } = {}
    for (const dv of defaultVals) {
      defaultValsMap[dv.name] = dv
    }
    for (const p of properties) {
      const dv = defaultValsMap[p.name]
      if (!p.value && !p.rule && dv) {
        p.value = dv.value
        p.rule = dv.rule
      }
    }

    // check required
    if (forceVerify && ['GET', 'POST'].indexOf(method) > -1) {
      const requiredProperties = await Property.findAll({
        attributes,
        where: { interfaceId, scope: 'request', required: true },
      })
      let passed = true
      let pFailed: Property | undefined
      let params = { ...ctx.request.query, ...ctx.request.body }
      // http request???head??????????????????????????????head?????????????????????????????????header??????????????????????????????
      params = Object.assign(params, ctx.request.headers)
      for (const p of requiredProperties) {
        if (typeof params[p.name] === 'undefined') {
          passed = false
          pFailed = p
          break
        }
      }
      if (!passed) {
        ctx.set(
          'X-RAP-WARNING',
          `Required parameter ${pFailed.name} has not be passed in.`
        )
      }
    }

    properties = properties.map((item: any) => item.toJSON())

    // ????????????????????????
    let requestProperties: any = await Property.findAll({
      attributes,
      where: { interfaceId, scope: 'request' },
    })
    requestProperties = requestProperties.map((item: any) => item.toJSON())
    const requestData = Tree.ArrayToTreeToTemplateToData(requestProperties)
    Object.assign(requestData, { ...ctx.params, ...ctx.query, ...ctx.body })
    let data = Tree.ArrayToTreeToTemplateToData(properties, requestData)
    if (data.__root__) {
      data = data.__root__
    }
    ctx.type = 'json'
    ctx.status = itf.status
    ctx.body = JSON.stringify(data, undefined, 2)
    const Location = data.Location
    if (Location && itf.status === 301) {
      ctx.redirect(Location)
      return
    }
    if (itf && itf.url.indexOf('[callback]=') > -1) {
      const query = querystring.parse(itf.url.substring(itf.url.indexOf('?') + 1))
      const cbName = query['[callback]']
      const cbVal = ctx.request.query[`${cbName}`]
      if (cbVal) {
        const body = typeof ctx.body === 'object' ? JSON.stringify(ctx.body, undefined, 2) : ctx.body
        ctx.type = 'application/x-javascript'
        ctx.body = cbVal + '(' + body + ')'
      }
    }
  }
}
