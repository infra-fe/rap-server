import router from './router'
import { Repository, Interface, Property } from '../models'
import { QueryInclude } from '../models'
import Tree from './utils/tree'
import { sleep } from './utils/sleep'
import CounterService from '../service/counter'
import { MockService } from '../service/mock'

const attributes: any = { exclude: [] }
const pt = require('node-print').pt
const beautify = require('js-beautify').js_beautify

const MAX_DELAY = 3 * 60 * 1000 // 最长延时3分钟

// 检测是否存在重复接口，会在返回的插件 JS 中提示。同时也会在编辑器中提示。
const parseDuplicatedInterfaces = (repository: Repository) => {
  const counter: any = {}
  for (const itf of repository.interfaces) {
    const key = `${itf.method} ${itf.url}`
    counter[key] = [...(counter[key] || []), { id: itf.id, method: itf.method, url: itf.url }]
  }
  const duplicated = []
  for (const key in counter) {
    if (counter[key].length > 1) {
      duplicated.push(counter[key])
    }
  }
  return duplicated
}
const generatePlugin = (protocol: any, host: any, repository: Repository) => {
  // DONE 2.3 protocol 错误，应该是 https
  const duplicated = parseDuplicatedInterfaces(repository)
  const editor = `${protocol}://rap2.taobao.org/repository/editor?id=${repository.id}` // [TODO] replaced by cur domain
  const result = `
/**
 * 仓库    #${repository.id} ${repository.name}
 * 在线编辑 ${editor}
 * 仓库数据 ${protocol}://${host}/repository/get?id=${repository.id}
 * 请求地址 ${protocol}://${host}/app/mock/${repository.id}/:method/:url
 *    或者 ${protocol}://${host}/app/mock/template/:interfaceId
 *    或者 ${protocol}://${host}/app/mock/data/:interfaceId
 */
;(function(){
  let repositoryId = ${repository.id}
  let interfaces = [
    ${repository.interfaces.map((itf: Interface) =>
    `{ id: ${itf.id}, name: '${itf.name}', method: '${itf.method}', url: '${itf.url}',
      request: ${JSON.stringify(itf.request)},
      response: ${JSON.stringify(itf.response)} }`
  ).join(',\n    ')}
  ]
  ${duplicated.length ? `console.warn('检测到重复接口，请访问 ${editor} 修复警告！')\n` : ''}
  let RAP = window.RAP || {
    protocol: '${protocol}',
    host: '${host}',
    interfaces: {}
  }
  RAP.interfaces[repositoryId] = interfaces
  window.RAP = RAP
})();`
  return beautify(result, { indent_size: 2 })
}

router.get('/app/plugin/:repositories', async (ctx) => {
  const repositoryIds = new Set<number>(ctx.params.repositories.split(',')
    .map((item: string) => +item).filter((item: any) => item)) // _.uniq() => Set
  const result = []
  for (const id of repositoryIds) {
    const repository = await Repository.findByPk(id, {
      attributes: { exclude: [] },
      include: [
        QueryInclude.Creator,
        QueryInclude.Owner,
        QueryInclude.Locker,
        QueryInclude.Members,
        QueryInclude.Organization,
        QueryInclude.Collaborators,
      ],
    } as any)
    if (!repository) {continue}
    if (repository.collaborators) {
      repository.collaborators.map(item => {
        repositoryIds.add(item.id)
      })
    }
    repository.interfaces = await Interface.findAll<Interface>({
      attributes: { exclude: [] },
      where: {
        repositoryId: repository.id,
      },
      include: [
        QueryInclude.Properties,
      ],
    } as any)
    repository.interfaces.forEach(itf => {
      itf.request = Tree.ArrayToTreeToTemplate(itf.properties.filter(item => item.scope === 'request'))
      itf.response = Tree.ArrayToTreeToTemplate(itf.properties.filter(item => item.scope === 'response'))
    })
    // 修复 协议总是 http
    // https://lark.alipay.com/login-session/unity-login/xp92ap
    const protocol = ctx.headers['x-client-scheme'] || ctx.protocol
    result.push(generatePlugin(protocol, ctx.host, repository))
  }

  ctx.type = 'application/x-javascript; charset=utf-8'
  ctx.body = result.join('\n')
})

// /app/mock/:repository/:method/:url
// X DONE 2.2 支持 GET POST PUT DELETE 请求
// DONE 2.2 忽略请求地址中的前缀斜杠
// DONE 2.3 支持所有类型的请求，这样从浏览器中发送跨越请求时不需要修改 method
router.all('/app/mock/:repositoryId(\\d+)/:url(.+)', async (ctx) => {
  // 设置请求延迟，单位为毫秒
  try {
    const { __delay } = ctx.request.query
    if (__delay) {
      let delay = Array.isArray(__delay) ? parseInt(__delay[__delay.length - 1], 10) : parseInt(__delay, 10)
      delay = delay > MAX_DELAY ? MAX_DELAY : delay
      if (delay > 0) {
        await sleep(delay)
      }
    }
  } catch (error) {
    console.error('mock delay error:', error)
  }

  await MockService.mock(ctx, { forceVerify: true })
})

router.all('/app/mock-noverify/:repositoryId(\\d+)/:url(.+)', async ctx => {
  await MockService.mock(ctx, { forceVerify: false })
})

// DONE 2.2 支持获取请求参数的模板、数据、Schema
router.get('/app/mock/template/:interfaceId', async (ctx) => {
  await CounterService.count()
  const { interfaceId } = ctx.params
  const { scope = 'response' } = ctx.query
  const properties = await Property.findAll({
    attributes,
    where: { interfaceId, scope },
  })
  // pt(properties.map(item => item.toJSON()))
  const template = Tree.ArrayToTreeToTemplate(properties)
  ctx.type = 'json'
  ctx.body = Tree.stringifyWithFunctonAndRegExp(template)
  // ctx.body = template
  // ctx.body = JSON.stringify(template, null, 2)
})

router.all('/app/mock/data/:interfaceId', async (ctx) => {
  await CounterService.count()
  const { interfaceId } = ctx.params
  const { scope = 'response' } = ctx.query
  let properties: any = await Property.findAll({
    attributes,
    where: { interfaceId, scope },
  })
  properties = properties.map((item: any) => item.toJSON())
  // pt(properties)

  // DONE 2.2 支持引用请求参数
  let requestProperties: any = await Property.findAll({
    attributes,
    where: { interfaceId, scope: 'request' },
  })
  requestProperties = requestProperties.map((item: any) => item.toJSON())
  const requestData = Tree.ArrayToTreeToTemplateToData(requestProperties)
  Object.assign(requestData, ctx.query)

  let data = Tree.ArrayToTreeToTemplateToData(properties, requestData)
  ctx.type = 'json'
  if (data._root_) {
    data = data._root_
  }
  ctx.body = JSON.stringify(data, undefined, 2)
})

router.get('/app/mock/schema/:interfaceId', async (ctx) => {
  await CounterService.count()
  const { interfaceId } = ctx.params
  const { scope = 'response' } = ctx.query
  let properties: any = await Property.findAll({
    attributes,
    where: { interfaceId, scope },
  })
  pt(properties.map((item: any) => item.toJSON()))
  properties = properties.map((item: any) => item.toJSON())
  const schema = Tree.ArrayToTreeToTemplateToJSONSchema(properties)
  ctx.type = 'json'
  ctx.body = Tree.stringifyWithFunctonAndRegExp(schema)
})

router.get('/app/mock/tree/:interfaceId', async (ctx) => {
  await CounterService.count()
  const { interfaceId } = ctx.params
  const { scope = 'response' } = ctx.query
  let properties: any = await Property.findAll({
    attributes,
    where: { interfaceId, scope },
  })
  pt(properties.map((item: any) => item.toJSON()))
  properties = properties.map((item: any) => item.toJSON())
  const tree = Tree.ArrayToTree(properties)
  ctx.type = 'json'
  ctx.body = Tree.stringifyWithFunctonAndRegExp(tree)
})
