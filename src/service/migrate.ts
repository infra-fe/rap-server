import * as JSON5 from 'json5'
import * as querystring from 'querystring'
import * as rp from 'request-promise'
import { Interface, Module, Property, QueryInclude, Repository, User } from '../models'
import { SCOPES } from '../models/bo/property'
import Tree from '../routes/utils/tree'
// import { Op } from 'sequelize'
import * as _ from 'lodash'
import { cloneDeep } from 'lodash'
import * as md5 from 'md5'
import * as Consts from '../routes/utils/const'
import { SchemaObject } from '../types/openapi'
import { removeSwaggerAllOf, SwaggerDataV2 } from '../utils/swaggerUtils'
import MailService from './mail'
import RedisService, { CACHE_KEY } from './redis'
import RepositoryService from './repository'
import RepositoryVersionService from './repositoryVersion'
const isMd5 = require('is-md5')
const Converter = require('api-spec-converter')
const safeEval = require('notevil')

const SWAGGER_VERSION = {
  1: '2.0',
}
export enum IMPORT_TYPE {
  /** 从Swagger 2.0 URL 或 JSON 文件导入 */
  SWAGGER_2_0 = 1,
  /** 从RAP2改动时系统生成的备份JSON文件导入 */
  RAP2_ITF_BACKUP = 2,
  /** 从YAPI导入 */
  RAP = 3,
  YAPI = 4
}
export enum COVER_TYPE {
  CREATE = 1,
  COVER = 2
}
/**
 * swagger json结构转化的数组转化为树形结构
 * @param list
 */
const arrayToTree = list => {
  const parseChildren = (list, parent) => {
    list.forEach(item => {
      if (item.parent === parent.id) {
        item.depth = parent.depth + 1
        item.parentName = parent.name
        item.children = item.children || []
        parent.children.push(item)
        parseChildren(list, item)
      }
    })
    return parent
  }
  return parseChildren(list, {
    id: 'root',
    name: 'root',
    children: [],
    depth: -1,
    parent: -1,
  })
}

/**
 * swagger json结构转化的数组转化的树形结构转化为数组
 * @param tree
 */
// const treeToArray = (tree: any) => {
//   const parseChildren = (parent: any, result: any) => {
//     if (!parent.children) {
//       return result
//     }
//     parent.children.forEach((item: any) => {
//       result.push(item)
//       parseChildren(item, result)
//       delete item.children
//     })
//     return result
//   }
//   return parseChildren(tree, [])
// }

/**
 * 接口属性-数组结构转化为树形结构
 * @param list
 */
// const arrayToTreeProperties = (list: any) => {
//   const parseChildren = (list: any, parent: any) => {
//     list.forEach((item: any) => {
//       if (item.parentId === parent.id) {
//         item.depth = parent.depth + 1
//         item.children = item.children || []
//         parent.children.push(item)
//         parseChildren(list, item)
//       }
//     })
//     return parent
//   }
//   return parseChildren(list, {
//     id: -1,
//     name: 'root',
//     children: [],
//     depth: -1,
//   })
// }

/**
 * 参数请求类型枚举
 */
const REQUEST_TYPE_POS = {
  path: 2,
  query: 2,
  header: 1,
  formData: 3,
  body: 3,
}

let checkSwaggerResult = []
let changeTip = '' // 变更信息
let beansCache = {} // 参数构建时，暂存definitions中对象的解析结果
let hitCacheCount = 0 // 命中缓存的次数
let setCacheCount = 0 // 设置缓存的次数

/**
 * Swagger JSON 参数递归处理成数组
 * @param parameters 参数列表数组
 * @param parent 父级id
 * @param parentName 父级属性name
 * @param depth parameters list 中每个属性的深度
 * @param result swagger转化为数组结果 -- 对swagger参数处理结果
 * @param definitions swagger $ref definitions， 额外传递过来的swagger的definitions数据, 非计算核心算法
 * @param scope 参数类型 -- 【暂不用】用于参数校验后提示
 * @param apiInfo 接口信息 -- 【暂不用】用于参数校验后提示
 */
const parse = (parameters, parent, parentName, depth, result, definitions, scope, apiInfo, keyMap = new WeakMap()) => {
  for (let key = 0, len = parameters.length; key < len; key++) {
    const param = parameters[key]

    if (!param.$ref && !(param.items || {}).$ref) {
      // 非对象或者数组的基础类型
      result.push({
        ...param,
        parent,
        parentName,
        depth,
        id: `${parent}-${key}`,
      })

      if (['object'].includes(param.type) && param.properties) {
        const list = Object.entries(param.properties).map(([key, property]) => ({
          name: key,
          parentName: param.name,
          depth: depth + 1,
          ...property as object,
          in: param.in, // response 无所谓，不使用但是request 使用
          required: (param.required || []).indexOf(key) >= 0,
        }))
        parse(list, `${parent}-${key}`, param.name, depth + 1, result, definitions, scope, apiInfo, keyMap)
      }
    } else {
      // 数组类型或者对象类型
      let paramType = ''
      if (param.items) {
        paramType = 'array'
      } else {
        paramType = 'object'
      }

      result.push({
        ...param,
        parent,
        parentName,
        depth,
        id: `${parent}-${key}`,
        type: paramType,
      })

      let refName
      if (!param.items) {
        // 对象
        refName = param.$ref.split('#/definitions/')[1]
        delete result.find(item => item.id === `${parent}-${key}`)['$ref']
      }
      if (param.items) {
        // 数组
        refName = param.items.$ref.split('#/definitions/')[1]
        delete result.find(item => item.id === `${parent}-${key}`).items
      }

      if (beansCache?.[refName]) {
        const newParent = `${parent}-${key}`
        let oldParent = null
        result.push(
          // 对象进行浅克隆：考虑多层的对象复用
          ...beansCache[refName].map(item => {
            oldParent = oldParent || item.parent // 取第一属性的parent，作为旧的parent
            return {
              ...item,
              id: item.id.replace(oldParent, newParent), // 重命名当前节点的ID
              parent: item.parent.replace(oldParent, newParent), // 替换数据的父节点
            }
          })
        )
        hitCacheCount++
        continue
      }

      const ref = definitions[refName]
      const { properties, items } = ref || {}
      if (items) {
        const parentParam = result.find(each => each.name === param.name && each.parent === parent)
        // 更新父级数据类型
        parentParam.type = 'array'

        parse([ref], parent, parentName, depth, result, definitions, scope, apiInfo, keyMap)
      } else if (properties) {
        if (keyMap.has(ref)) {
          console.warn('Break the circular reference chain!! Depth is ', depth)
          continue
        } else {
          keyMap.set(ref, true)
        }

        const properties = ref.properties
        const list = []
        for (const key in properties) {
          // swagger文档中对definition定义属性又引用自身的情况处理-死循环
          if (properties[key].$ref) {
            if (properties[key].$ref.split('#/definitions/')[1] === refName) {
              // delete properties[key].$ref
              list.push({
                name: key,
                parentName: param.name,
                depth: depth + 1,
                ...properties[key],
                $ref: null,
                type: 'object',
                in: param.in,
                required: (ref.required || []).indexOf(key) >= 0,
                description: `【递归父级属性】${properties[key].description || ''}`,
              })
            } else {
              list.push({
                name: key,
                parentName: param.name,
                depth: depth + 1,
                ...properties[key],
                in: param.in,
                required: (ref.required || []).indexOf(key) >= 0,
              })
            }
          } else if ((properties[key].items || {}).$ref) {
            if (properties[key].items.$ref.split('#/definitions/')[1] === refName) {
              // delete properties[key].items.$ref
              list.push({
                name: key,
                parentName: param.name,
                depth: depth + 1,
                ...properties[key],
                type: 'array',
                items: null,
                $ref: null,
                in: param.in,
                required: (ref.required || []).indexOf(key) >= 0,
                description: `【递归父级属性】${properties[key].description || ''}`,
              })
            } else {
              list.push({
                name: key,
                parentName: param.name,
                depth: depth + 1,
                ...properties[key],
                in: param.in,
                required: (ref.required || []).indexOf(key) >= 0,
              })
            }
          } else {
            list.push({
              name: key,
              parentName: param.name,
              depth: depth + 1,
              ...properties[key],
              in: param.in, // response 无所谓，不使用但是request 使用
              required: (ref.required || []).indexOf(key) >= 0,
            })
          }
        }
        parse(list, `${parent}-${key}`, param.name, depth + 1, result, definitions, scope, apiInfo, keyMap)
        keyMap.delete(ref)

        if (beansCache) {
          // 设置解析好的definitions缓存
          const refDefinition = result.filter(item => {
            // fix: 被引用的对象可能存在多级，即属性也是对象类型
            return item.parent.indexOf(`${parent}-${key}`) >= 0
          })
          if (refDefinition.length > 0) {
            beansCache[refName] = refDefinition
            setCacheCount++
          }
        }
      }
    }
  }
}

const transformRapParams = p => {
  let rule = '',
    description = '',
    value = p.default || ''

  // 类型转化处理
  let type = p.type || 'string'
  if (type === 'integer') { type = 'number' }
  type = type[0].toUpperCase() + type.slice(1)

  // 规则属性说明处理
  if (p.type === 'string' && p.minLength && p.maxLength) {
    rule = `${p.minLength}-${p.maxLength}`
    description = `${description}|长度限制: ${p.minLength}-${p.maxLength}`
  } else if (p.type === 'string' && p.minLength && !p.maxLength) {
    rule = `${p.minLength}`
    description = `${description}|长度限制：最小值: ${p.minLength}`
  } else if (p.type === 'string' && !p.minLength && p.maxLength) {
    rule = `${p.required ? '1' : '0'}-${p.maxLength}`
    description = `${description}|长度限制：最大值: ${p.maxLength}`
  }
  if (p.type === 'string' && p.enum && p.enum.length > 0) {
    description = `${description}|枚举值: ${p.enum.join()}`
  }
  if ((p.type === 'integer' || p.type === 'number') && p.minimum && p.maxinum) {
    rule = `${p.minimum}-${p.maxinum}`
    description = `${description}|数据范围: ${p.minimum}-${p.maxinum}`
  }
  if ((p.type === 'integer' || p.type === 'number') && p.minimum && !p.maxinum) {
    rule = `${p.minimum}`
    description = `${description}|数据范围: 最小值：${p.minimum}`
  }
  if ((p.type === 'integer' || p.type === 'number') && !p.minimum && p.maxinum) {
    rule = `${p.required ? '1' : '0'}-${p.maxinum}`
    description = `${description}|数据范围: 最大值：${p.maxinum}`
  }

  // 默认值转化处理
  value = p.default || ''
  if (!p.default && p.type === 'string') { value = '@ctitle' }
  if (!p.default && (p.type === 'number' || p.type === 'integer')) { value = '@integer(0, 100000)' }
  if (p.type === 'boolean') {
    value = p.default === true || p.default === false ? p.default.toString() : 'false'
  }
  if (p.enum?.length > 0) {
    value = `@pick([${p.enum.map(item => JSON.stringify(item)).join(',')}])`
  }
  if (p.type === 'string' && p.format === 'date-time') { value = '@datetime' }
  if (p.type === 'string' && p.format === 'date') { value = '@date' }

  if (p.type === 'array' && p.default) {
    value = typeof p.default === 'object' ? JSON.stringify(p.default) : p.default.toString()
  }
  if (p.type === 'array' && p.default === undefined && p.items?.type) {
    // 基本类型组成的数组，如string[]，number[]
    const itemType = p.items.type
    if (itemType === 'string') {
      value = JSON.stringify(['@ctitle'])
    } else if (['number', 'integer'].includes(itemType)) {
      value = JSON.stringify([1])
    }
  }
  if (/^function/.test(value)) { type = 'Function' } // @mock=function(){} => Function
  if (/^\$order/.test(value)) {
    // $order => Array|+1
    type = 'Array'
    rule = '+1'
    const orderArgs = /\$order\((.+)\)/.exec(value)
    if (orderArgs) { value = `[${orderArgs[1]}]` }
  }

  if (['String', 'Number', 'Boolean', 'Object', 'Array', 'Function', 'RegExp', 'Null'].indexOf(type) === -1) {
    /** File暂时不支持，用Null代替 */
    type = 'Null'
  }

  return {
    type,
    rule,
    description: description.length > 0 ? description.substring(1) : '',
    value,
  }
}

// const propertiesUpdateService = async (properties, itfId) => {
//   properties = Array.isArray(properties) ? properties : [properties]
//   let itf = await Interface.findByPk(itfId)

//   let existingProperties = properties.filter((item: any) => !item.memory)
//   let result = await Property.destroy({
//     where: {
//       id: { [Op.notIn]: existingProperties.map((item: any) => item.id) },
//       interfaceId: itfId,
//     },
//   })

//   // 更新已存在的属性
//   for (let item of existingProperties) {
//     let affected = await Property.update(item, {
//       where: { id: item.id },
//     })
//     result += affected[0]
//   }
//   // 插入新增加的属性
//   let newProperties = properties.filter((item: any) => item.memory)
//   let memoryIdsMap: any = {}
//   for (let item of newProperties) {
//     let created = await Property.create(
//       Object.assign({}, item, {
//         id: undefined,
//         parentId: -1,
//         priority: item.priority || Date.now(),
//       }),
//     )
//     memoryIdsMap[item.id] = created.id
//     item.id = created.id
//     result += 1
//   }
//   // 同步 parentId
//   for (let item of newProperties) {
//     let parentId = memoryIdsMap[item.parentId] || item.parentId
//     await Property.update(
//       { parentId },
//       {
//         where: { id: item.id },
//       },
//     )
//   }
//   itf = await Interface.findByPk(itfId, {
//     include: (QueryInclude.RepositoryHierarchy as any).include[0].include,
//   })
//   return {
//     data: {
//       result,
//       properties: itf.properties,
//     },
//   }
// }

const sendMailTemplate = changeTip => {
  const html = MailService.mailNoticeTemp
    .replace('{=TITLE=}', '您相关的接口存在如下变更：(请注意代码是否要调整)')
    .replace(
      '{=CONTENT=}',
      (changeTip.split('<br/>') || [])
        .map(one => {
          return one ? `<li style="margin-bottom: 20px;">${one}</li>` : ''
        })
        .join('')
    )
  return html
}
export default class MigrateService {
  public static async importRepoFromRAP1ProjectData(
    orgId: number,
    curUserId: number,
    projectData: any
  ): Promise<boolean> {
    if (!projectData || !projectData.id || !projectData.name) { return false }
    let pCounter = 1
    let mCounter = 1
    let iCounter = 1
    const repo = await Repository.create({
      name: projectData.name,
      description: projectData.introduction,
      visibility: true,
      ownerId: curUserId,
      creatorId: curUserId,
      organizationId: orgId,
    })
    for (const module of projectData.moduleList) {
      const mod = await Module.create({
        name: module.name,
        description: module.introduction,
        priority: mCounter++,
        creatorId: curUserId,
        repositoryId: repo.id,
      })
      for (const page of module.pageList) {
        for (const action of page.actionList) {
          const itf = await Interface.create({
            moduleId: mod.id,
            name: `${page.name}-${action.name}`,
            description: action.description,
            url: action.requestUrl || '',
            priority: iCounter++,
            creatorId: curUserId,
            repositoryId: repo.id,
            method: getMethodFromRAP1RequestType(+action.requestType),
          })
          for (const p of action.requestParameterList) {
            await processParam(p, SCOPES.REQUEST)
          }
          for (const p of action.responseParameterList) {
            await processParam(p, SCOPES.RESPONSE)
          }
          async function processParam(p: OldParameter, scope: SCOPES, parentId?: number) {
            const RE_REMARK_MOCK = /@mock=(.+)$/
            const ramarkMatchMock = RE_REMARK_MOCK.exec(p.remark)
            const remarkWithoutMock = p.remark.replace(RE_REMARK_MOCK, '')
            const name = p.identifier.split('|')[0]
            let rule = p.identifier.split('|')[1] || ''
            let type = (p.dataType || 'string').split('<')[0] // array<number|string|object|boolean> => Array
            type = type[0].toUpperCase() + type.slice(1) // foo => Foo
            let value = (ramarkMatchMock && ramarkMatchMock[1]) || ''
            if (/^function/.test(value)) { type = 'Function' } // @mock=function(){} => Function
            if (/^\$order/.test(value)) {
              // $order => Array|+1
              type = 'Array'
              rule = '+1'
              const orderArgs = /\$order\((.+)\)/.exec(value)
              if (orderArgs) { value = `[${orderArgs[1]}]` }
            }
            const description = []
            if (p.name) { description.push(p.name) }
            if (p.remark && remarkWithoutMock) { description.push(remarkWithoutMock) }
            const pCreated = await Property.create({
              scope,
              name,
              rule,
              value,
              type,
              description: `${p.remark}${p.name ? ', ' + p.name : ''}`,
              priority: pCounter++,
              interfaceId: itf.id,
              creatorId: curUserId,
              moduleId: mod.id,
              repositoryId: repo.id,
              parentId: parentId || -1,
            })
            for (const subParam of p.parameterList) {
              processParam(subParam, scope, pCreated.id)
            }
          }
        }
      }
    }
    return true
  }
  public static checkAndFix(): void {
    // console.log('checkAndFix')
    // this.checkPasswordMd5().then()
  }

  static async checkPasswordMd5() {
    console.log('  checkPasswordMd5')
    const users = await User.findAll()
    if (users.length === 0 || isMd5(users[0].password)) {
      console.log('  users empty or md5 check passed')
      return
    }
    for (const user of users) {
      if (!isMd5(user.password)) {
        user.password = md5(md5(user.password))
        await user.save()
        console.log(`handle user ${user.id}`)
      }
    }
  }
  public static async coverInterface(
    itf: Interface,
    moduleId: number,
    name: string,
    description: string,
    curUserId: number,
    bodyOption?: string,
    status?: number
  ) {
    const { id } = itf
    const properties = await Property.findAll({ where: { interfaceId: id } })
    await RepositoryService.addHistoryLog({
      entityId: itf.repositoryId,
      entityType: Consts.ENTITY_TYPE.REPOSITORY,
      changeLog: `[Interface] ${itf.name} (${itf.url}) [covered],[data is backup]。`,
      userId: curUserId,
      relatedJSONData: JSON.stringify({ 'itf': itf, 'properties': properties }),
    })
    await Property.destroy({ where: { interfaceId: id } })
    const updateData = { moduleId, name, description: description || '' }
    if (bodyOption) {
      updateData['bodyOption'] = bodyOption
    }
    if (status) {
      updateData['status'] = status
    }
    await Interface.update(updateData, { where: { id } })
  }
  /** RAP1 property */
  public static async importRepoFromRAP1DocUrl(
    orgId: number,
    curUserId: number,
    docUrl: string,
    version: number,
    projectDataJSON: string
  ): Promise<boolean> {
    let result: any = null
    if (version === 1) {
      const { projectId } = querystring.parse(docUrl.substring(docUrl.indexOf('?') + 1))
      let domain = docUrl
      if (domain.indexOf('http') === -1) {
        domain = 'http://' + domain
      }
      domain = domain.substring(0, domain.indexOf('/', domain.indexOf('.')))
      const response = await rp(`${domain}/api/queryRAPModel.do?projectId=${projectId}`, {
        json: false,
      })
      result = JSON.parse(response)

      // result =  unescape(result.modelJSON)
      result = result.modelJSON
      result = safeEval('(' + result + ')')
    } else if (version === 2) {
      result = safeEval('(' + projectDataJSON + ')')
    }
    return await this.importRepoFromRAP1ProjectData(orgId, curUserId, result)
  }

  /** 请求参对象->数组->标准树形对象 @param swagger @param parameters */
  public static async swaggerToModelRequest(
    swagger: SwaggerData,
    parameters: any[],
    apiInfo: any
  ): Promise<any> {
    let { definitions = {} } = swagger
    const result = []
    definitions = JSON.parse(JSON.stringify(definitions)) // 防止接口之间数据处理相互影响

    const list = parameters.filter(item => item.in !== 'body') // 外层处理参数数据结果
    const bodyObj = parameters.find(item => item.in === 'body') // body unique

    if (bodyObj) {
      const {
        $ref, type, properties, required,
      } = bodyObj?.schema || {} as SchemaObject

      const $bodyRef = $ref

      let ref = null
      if ($bodyRef) {
        const refName = $bodyRef.split('#/definitions/')[1]
        ref = definitions[refName]
      } else if (properties) {
        ref = {
          type,
          properties,
          required,
        }
      }

      if (ref) {
        const properties = ref.properties || {}
        const bodyParameters = []

        for (const key in properties) {
          if (!properties.hasOwnProperty(key)) {
            continue
          }
          bodyParameters.push({
            name: key,
            ...properties[key],
            in: 'body',
            required: (ref.required || []).indexOf(key) >= 0,
          })
        }

        list.push(...bodyParameters)
      }
    }
    parse(list, 'root', 'root', 0, result, definitions, 'request', apiInfo)
    const successResult = result.filter(item => item.name)
    const tree = arrayToTree(cloneDeep(successResult))
    return tree
  }

  /**
   * 返回参数对象->数组->标准树形对象
   * 如果swagger responses参数没有的情况下异常处理
   * 如果swagger responses对象200不存在情况下异常处理
   * @param swagger
   * @param response
   */
  public static async swaggerToModelRespnse(
    swagger: SwaggerData,
    response: object,
    apiInfo: any
  ): Promise<any> {
    let { definitions = {} } = swagger
    definitions = JSON.parse(JSON.stringify(definitions)) // 防止接口之间数据处理相互影响

    let successObj = null
    let successStatus = 200
    if (response['200']) {
      successObj = response['200']
    } else if (response['201']) {
      successObj = response['201']
      successStatus = 201
    }
    if (!successObj) { return [] }

    const {
      $ref, // 对象类型
      properties, // 对象定义
      type, items, // 数组类型
      required,
    } = successObj?.schema || {} as SchemaObject

    let responseRequired = required
    let responseProperties = properties || items?.properties
    const $responseRef = $ref || items?.$ref
    if (!responseProperties && $responseRef) {
      const refName = $responseRef.split('#/definitions/')[1]
      responseProperties = definitions[refName]?.properties
      responseRequired = definitions[refName]?.required
    }

    if (!responseProperties) {
      // 没有按照接口规范返回数据结构,默认都是对象
      return []
    }

    const parameters = []
    if (type === 'array') {
      parameters.push({
        name: '__root__',
        type,
        items,
        in: 'body',
        required: true,
        default: false,
        description: '',
      })
    } else if (responseProperties) {
      const properties = responseProperties

      for (const key in properties) {
        if (!properties.hasOwnProperty(key)) {
          continue
        }
        // 公共返回参数描述信息设置
        let description = ''
        if (!properties[key].description && key === 'errorCode') {
          description = '错误码'
        }
        if (!properties[key].description && key === 'errorMessage') {
          description = '错误描述'
        }
        if (!properties[key].description && key === 'success') {
          description = '请求业务结果'
        }

        parameters.push({
          name: key,
          ...properties[key],
          in: 'body',
          required: key === 'success' ? true : (responseRequired || []).indexOf(key) >= 0,
          default: key === 'success' ? true : properties[key].default || false,
          description: properties[key].description || description,
        })
      }
    }

    const result = []
    parse(parameters, 'root', 'root', 0, result, definitions, 'response', apiInfo)
    const successResult = result.filter(item => item.name)
    const tree = arrayToTree(cloneDeep(successResult))
    if (successStatus) {
      tree.status = successStatus
    }
    return tree
  }

  public static async importRepoFromSwaggerProjectData(
    repositoryId: number,
    curUserId: number,
    swagger: SwaggerData,
    cover: number,
    versionId?: number
  ): Promise<boolean> {
    checkSwaggerResult = []
    if (!swagger.paths || !swagger.swagger) { return false }

    let mCounter = 1 // 模块优先级顺序
    let iCounter = 1 // 接口优先级顺序
    let pCounter = 1 // 参数优先级顺序
    const isCreate = cover ? cover === COVER_TYPE.CREATE : true
    /**
     * 接口创建并批量创建属性，规则，默认值，说明等处理
     * @param p
     * @param scope
     * @param interfaceId
     * @param moduleId
     * @param parentId
     */
    async function processParam(
      p: SwaggerParameter,
      scope: SCOPES,
      interfaceId: number,
      moduleId: number,
      parentId?: number,
      oldProperties?: Property[],
      oldParentId?: number
    ) {
      const { rule, value, type, description } = transformRapParams(p)
      const joinDescription = `${p.description || ''}${(p.description || '') && (description || '') ? '|' : ''}${description || ''}`

      let oldProperty = null
      if (Array.isArray(oldProperties)) {
        const index = oldProperties.findIndex(item => {
          return (
            // 范围约束
            item.scope === scope
            && item.parentId === (oldParentId || -1)

            // 字段属性约束
            && item.name === p.name
            && item.type === type
          )
        })
        if (index >= 0) {
          oldProperty = oldProperties.splice(index, 1)?.[0]
        }
      }

      const pCreated = await Property.create({
        scope,
        name: p.name,
        rule: oldProperty?.rule || rule,
        value: oldProperty?.value || value,
        type,
        required: p.required,
        description: joinDescription,
        priority: pCounter++,
        interfaceId: interfaceId,
        creatorId: curUserId,
        moduleId: moduleId,
        repositoryId: repositoryId,
        parentId: parentId || -1,
        pos: REQUEST_TYPE_POS[p.in],
        memory: true,
      })

      for (const subParam of p.children) {
        processParam(subParam, scope, interfaceId, moduleId, pCreated.id, oldProperties, oldProperty?.id)
      }
    }

    let { tags = [] } = swagger
    const { paths = {} } = swagger
    const pathTag: SwaggerTag[] = []

    // 获取所有的TAG: 处理ROOT TAG中没有的情况
    for (const action in paths) {
      if (!paths.hasOwnProperty(action)) { continue }
      const methodList = Object.keys(paths[action])
      for (const method of methodList) {
        const apiObj = paths[action][method]
        // 处理没有path没有tag的情况
        if (!Array.isArray(apiObj.tags)) {
          apiObj.tags = ['default']
        }
        const index = pathTag.findIndex((it: SwaggerTag) => {
          return apiObj.tags.length > 0 && it.name === apiObj.tags[0]
        })
        if (index < 0 && apiObj.tags.length > 0) {
          pathTag.push({
            name: apiObj.tags[0],
            description: tags.find(item => item.name === apiObj.tags[0])?.description || '',
          })
        }
      }
    }
    tags = pathTag

    if (checkSwaggerResult.length > 0) { return false }

    for (const tag of tags) {
      if (checkSwaggerResult.length > 0) { break }

      let repository: Partial<Repository>
      const [repositoryModules] = await Promise.all([
        Repository.findByPk(repositoryId, {
          attributes: { exclude: [] },
          include: [{ ...QueryInclude.RepositoryHierarchy, where: { versionId } }],
          order: [
            [{ model: Module, as: 'modules' }, 'priority', 'asc'],
            [
              { model: Module, as: 'modules' },
              { model: Interface, as: 'interfaces' },
              'priority',
              'asc',
            ],
          ],
        }),
      ])
      repository = {
        ...repositoryModules.toJSON(),
      }

      const findIndex = repository.modules.findIndex(item => {
        return item.name === tag.name
      }) // 判断是否存在模块
      let mod = null
      if (findIndex < 0) {
        mod = await Module.create({
          name: tag.name?.substring(0, 256),
          description: tag.description,
          priority: mCounter++,
          creatorId: curUserId,
          repositoryId: repositoryId,
          versionId,
        })
      } else {
        mod = repository.modules[findIndex]
      }
      for (const action in paths) {
        if (!paths.hasOwnProperty(action)) { continue }
        const methodList = Object.keys(paths[action])
        for (const method of methodList) {
          const apiObj = paths[action][method]
          // const method = Object.keys(paths[action])[0]
          const actionTags0 = apiObj.tags[0]
          const url = action
          // 处理summary展示为undefined的情况
          if (!apiObj.summary) {
            apiObj.summary = apiObj.operationId || ''
          }
          const summary = apiObj.summary

          if (actionTags0 === tag.name) {
            // 判断接口是否存在该模块中，如果不存在则创建接口，存在则更新接口信息
            const [repositoryModules] = await Promise.all([
              Repository.findByPk(repositoryId, {
                attributes: { exclude: [] },
                include: [QueryInclude.RepositoryHierarchy],
                order: [
                  [{ model: Module, as: 'modules' }, 'priority', 'asc'],
                  [
                    { model: Module, as: 'modules' },
                    { model: Interface, as: 'interfaces' },
                    'priority',
                    'asc',
                  ],
                ],
              }),
            ])
            repository = {
              ...repositoryModules.toJSON(),
            }

            const request = await this.swaggerToModelRequest(
              swagger,
              apiObj.parameters || [],
              { url, summary }
            )
            const response = await this.swaggerToModelRespnse(swagger, apiObj.responses || {}, {
              url,
              summary,
            })
            // 处理完每个接口请求参数后，如果-遇到第一个存在接口不符合规范就全部返回
            if (checkSwaggerResult.length > 0) { break }

            // 判断对应模块是否存在该接口
            // const index = repository.modules.findIndex(item => {
            //   return (
            //     item.id === mod.id &&
            //     item.interfaces.findIndex(it => (it.url || '') === url) >= 0
            //   ) // 已经存在接口
            // })

            // if (index < 0) {
            // 创建接口
            const itfUrl = `${url.replace('-test', '')}`
            let itf = await Interface.findOne({
              where: { repositoryId, url: itfUrl, method: method.toUpperCase() },
            })
            // console.log('import:', repositoryId, itfUrl, method, !isCreate, itf?.lockerId, itf && !isCreate && !itf.lockerId)
            let oldProperties: Property[] = null
            if (itf && !isCreate && !itf.lockerId) {
              oldProperties = await Property.findAll({ where: { interfaceId: itf.id } })
              await this.coverInterface(itf, mod.id, apiObj.summary, apiObj.description, curUserId, null, response.status)
            } else {
              itf = await Interface.create({
                moduleId: mod.id,
                name: `${apiObj.summary}`,
                description: apiObj.description,
                url: itfUrl,
                priority: iCounter++,
                status: response.status || 200,
                creatorId: curUserId,
                repositoryId: repositoryId,
                method: method.toUpperCase(),
              })
            }

            for (const p of request.children || []) {
              try {
                await processParam(p, SCOPES.REQUEST, itf.id, mod.id, -1, oldProperties)
              } catch (e) {
                console.log('processParam request error:', e.message)
              }
            }
            for (const p of response.children || []) {
              try {
                await processParam(p, SCOPES.RESPONSE, itf.id, mod.id, -1, oldProperties)
              } catch (e) {
                console.log('processParam response error:', e.message)
              }
            }
            oldProperties = null // 释放内存
          }
        }
      }
    }

    if (checkSwaggerResult.length > 0) { return false }
    return true
  }

  /** Swagger property */
  public static async importRepoFromSwaggerDocUrl(
    orgId: number,
    curUserId: number,
    swagger: SwaggerData,
    version: number,
    mode: string,
    repositoryId: number,
    cover: number,
    versionId?: number
  ): Promise<any> {
    try {
      if (!swagger) { return { result: false, code: 'swagger' } }
      if (swagger.openapi && swagger.openapi.startsWith('3.0')) {
        const { spec } = await Converter.convert({
          from: 'openapi_3',
          to: 'swagger_2',
          source: swagger,
        })
        swagger = spec
      }
      const isAuto = !curUserId
      const hashValue = md5(JSON.stringify(swagger))
      const { host = '', info = {}, schemes, basePath = '' } = swagger
      if (swagger.swagger === SWAGGER_VERSION[version]) {
        let repos
        let result
        let mailRepositoryName = '',
          mailRepositoryId = 0,
          mailRepositoryMembers = []

        if (mode === 'manual') {
          repos = await Repository.findByPk(repositoryId, {
            attributes: { exclude: [] },
            include: [
              QueryInclude.Creator,
              QueryInclude.Owner,
              QueryInclude.Members,
              QueryInclude.Organization,
              QueryInclude.Collaborators,
            ],
          })
          const { organizationId, creatorId, members, collaborators, ownerId, name, hashValue: oldHashValue } = repos

          // 手动导入跳过hash校验，仅OpenAPI导入时进行hash校验
          if (isAuto && hashValue === oldHashValue) {
            return { result: true, code: 'success', msg: 'sameData' }
          }


          let baseUrl = ''
          if (basePath) {
            const path = basePath.replace(/https?:\/\//g, '')
            baseUrl = basePath.startsWith('/') ? path : '/' + path
          }
          if (host) {
            baseUrl = host + baseUrl
          }
          if (schemes && schemes.length > 0) {
            baseUrl = schemes[0] + (host ? '://' : ':/') + baseUrl
          }
          const body = {
            creatorId: creatorId,
            organizationId: orgId || organizationId,
            basePath: baseUrl,
            memberIds: (members || []).map((item: any) => item.id),
            collaboratorIds: (collaborators || []).map((item: any) => item.id),
            ownerId,
            visibility: true,
            name,
            id: repositoryId,
            description: `${info.title || ''}${info.version ? `(${info.version})` : ''}${info.title || info.version ? '\n' : ''}${info.description || ''}`,
            hashValue: isAuto ? hashValue : '',
          }
          result = await Repository.update(body, { where: { id: repositoryId } })

          mailRepositoryName = name
          mailRepositoryMembers = members
          mailRepositoryId = repositoryId
        } else if (mode === 'auto') {
          // 团队下直接导入功能作废，此处不用执行
          result = await Repository.create({
            id: 0,
            name: info.title || 'swagger导入仓库',
            description: info.description || 'swagger导入仓库',
            visibility: true,
            ownerId: curUserId,
            creatorId: curUserId,
            organizationId: orgId,
            members: [],
            collaborators: [],
            collaboratorIdstring: '',
            memberIds: [],
            collaboratorIds: [],
          })
        }

        if (result[0] || result.id) {
          const start_time = Date.now()
          beansCache = {}
          hitCacheCount = 0
          setCacheCount = 0

          swagger = removeSwaggerAllOf(swagger as SwaggerDataV2) as SwaggerData
          // console.log('ldt-removeSwaggerAllOf:', JSON.stringify(swagger))

          const bol = await this.importRepoFromSwaggerProjectData(
            mode === 'manual' ? repositoryId : result.id,
            curUserId || repos.creatorId,
            swagger,
            cover,
            versionId
          )

          beansCache = null // 释放内存
          console.log(`Importing swagger data into repository(${repositoryId}). Duration: ${(Date.now() - start_time) / 1000}s, hitCacheCount/setCacheCount: ${hitCacheCount}/${setCacheCount}.`)

          if (!bol) {
            return { result: checkSwaggerResult, code: 'checkSwagger' }
          } else {
            await RepositoryService.addHistoryLog({
              entityId: mode === 'manual' ? repositoryId : result.id,
              entityType: Consts.ENTITY_TYPE.REPOSITORY,
              changeLog: `[repository has been updated by importing swagger data]`,
              userId: curUserId || repos.creatorId,
            })
            await RedisService.delCache(CACHE_KEY.REPOSITORY_GET, result.id)
            if (changeTip.length > 0) {
              const to = mailRepositoryMembers.map(item => {
                return `"${item.fullname}" ${item.email},`
              })

              MailService.send(
                to,
                `仓库：${mailRepositoryName}(${mailRepositoryId})接口更新同步`,
                sendMailTemplate(changeTip)
              )
                .then(() => {/**  */ })
                .catch(() => {/** */ })

              // 钉钉消息发送
              // const dingMsg = {
              //   msgtype: 'action_card',
              //   action_card: {
              //     title: `仓库：${mailRepositoryName}(${mailRepositoryId})接口更新同步`,
              //     markdown: "支持markdown格式的正文内容",
              //     single_title: "查看仓库更新", // swagger 批量导入跳转至仓库， 如果后期只要接口更新就通知相关人的话，需要设置具体接口链接
              //     single_url: `https://rap2.alibaba-inc.com/repository/editor?id=${repositoryId}`
              //   }
              // }

              // DingPushService.dingPush(mailRepositoryMembers.map(item => item.empId).join(), dingMsg)
              // .catch((err) => { console.log(err) })
            }
            changeTip = ''
            return { result: bol, code: 'success' }
          }
        }
      } else {
        return { result: true, code: 'version' }
      }
    } catch (err) {
      console.log(err)
      return { result: false, code: 'error' }
    }
  }

  public static async importInterfaceFromJSON(data: any, curUserId: number, repositoryId: number, modId: number, cover?: number) {

    const itfData = data.itf ? data.itf : data
    let properties = data.itf ? data.properties : itfData?.properties
    const isCreate = cover ? cover === COVER_TYPE.CREATE : true

    let itf = await Interface.findOne({
      where: { repositoryId, url: itfData.url, method: itfData.method },
    })
    if (itf && !isCreate && !itf.lockerId) {
      await this.coverInterface(itf, modId, itfData.name, itfData.description, curUserId, itfData.bodyOption)
    } else {
      itf = await Interface.create({
        moduleId: modId,
        name: itfData.name,
        description: itfData.description || '',
        url: itfData.url,
        priority: 1,
        creatorId: curUserId,
        repositoryId,
        method: itfData.method,
        bodyOption: itfData.bodyOption,
      })
    }

    if (!properties) {
      properties = []
    }

    const idMaps: any = {}

    await Promise.all(
      properties.map(async (pData, index) => {
        const property = await Property.create({
          scope: pData.scope,
          name: pData.name,
          rule: pData.rule,
          value: pData.value,
          type: pData.type,
          description: pData.description,
          pos: pData.pos,
          priority: 1 + index,
          interfaceId: itf.id,
          creatorId: curUserId,
          moduleId: modId,
          repositoryId,
          parentId: -1,
        })
        idMaps[pData.id] = property.id
      })
    )

    await Promise.all(
      properties.map(async pData => {
        const newId = idMaps[pData.id]
        const newParentId = idMaps[pData.parentId]
        await Property.update(
          {
            parentId: newParentId,
          },
          {
            where: {
              id: newId,
            },
          }
        )
      })
    )
    await RedisService.delCache(CACHE_KEY.REPOSITORY_GET, repositoryId)
  }
  /** 可以直接让用户把自己本地的 data 数据导入到 RAP 中 */
  public static async importRepoFromJSON({
    data,
    curUserId,
    createRepo = false,
    pkId,
    cover,
    versionId = null,
  }: {
    data: JsonData
    curUserId: number
    createRepo?: boolean
    pkId?: number
    cover?: number
    versionId?: number
  }) {
    function parseJSON(str: string) {
      try {
        const data = JSON5.parse(str)
        return _.isObject(data) ? data : {}
      } catch (error) {
        return {}
      }
    }
    let targetVersionId = null
    if (createRepo) {
      if (pkId === undefined) {
        throw new Error('orgId is essential while createRepo = true')
      }
      const repo = await Repository.create({
        name: data.name,
        description: data.description,
        basePath: data.basePath,
        visibility: true,
        ownerId: curUserId,
        creatorId: curUserId,
        organizationId: pkId,
      })
      data.id = repo.id
    } else if (pkId) {
      const repo = await Repository.findByPk(pkId)
      if (!repo || !repo?.id) {
        throw new Error('can not find repo')
      }
      data.id = pkId
      if (versionId) {
        const version = await RepositoryVersionService.findByPk(versionId, pkId)
        if (version) {
          targetVersionId = version.id
        }
      }
    }
    const isCreate = cover ? cover === COVER_TYPE.CREATE : true
    const repositoryId = data.id
    await Promise.all(
      data.modules.map(async (modData, index) => {
        let mod = await Module.findOne({
          where: { repositoryId, name: modData.name, versionId: targetVersionId },
        })
        if (!mod) {
          mod = await Module.create({
            name: modData.name,
            description: modData.description || '',
            priority: index + 1,
            creatorId: curUserId,
            repositoryId,
            versionId: targetVersionId,
          })
        }
        await Promise.all(
          modData.interfaces.map(async (iftData, index) => {
            let properties = iftData.properties
            let itf = await Interface.findOne({
              where: { repositoryId, url: iftData.url, method: iftData.method },
            })
            if (itf && !isCreate && !itf.lockerId) {
              await this.coverInterface(itf, mod.id, iftData.name, iftData.description, curUserId, iftData.bodyOption)
            } else {
              itf = await Interface.create({
                moduleId: mod.id,
                name: iftData.name,
                description: iftData.description || '',
                url: iftData.url,
                priority: index + 1,
                creatorId: curUserId,
                repositoryId,
                method: iftData.method,
                bodyOption: iftData.bodyOption as Consts.BODY_OPTION,
              })
            }

            if (!properties && (iftData.requestJSON || iftData.responseJSON)) {
              const reqData = parseJSON(iftData.requestJSON)
              const resData = parseJSON(iftData.responseJSON)
              properties = [
                ...Tree.jsonToArray(reqData, {
                  interfaceId: itf.id,
                  moduleId: mod.id,
                  repositoryId,
                  scope: 'request',
                  userId: curUserId,
                }),
                ...Tree.jsonToArray(resData, {
                  interfaceId: itf.id,
                  moduleId: mod.id,
                  repositoryId,
                  scope: 'response',
                  userId: curUserId,
                }),
              ]
            }

            if (!properties) {
              properties = []
            }

            const idMaps: any = {}

            await Promise.all(
              properties.map(async (pData, index) => {
                const property = await Property.create({
                  scope: pData.scope,
                  name: pData.name,
                  rule: pData.rule,
                  value: pData.value,
                  type: pData.type,
                  description: pData.description,
                  pos: pData.pos,
                  priority: index + 1,
                  interfaceId: itf.id,
                  creatorId: curUserId,
                  moduleId: mod.id,
                  required: pData.required,
                  repositoryId,
                  parentId: -1,
                })
                idMaps[pData.id] = property.id
              })
            )

            await Promise.all(
              properties.map(async pData => {
                const newId = idMaps[pData.id]
                const newParentId = idMaps[pData.parentId]
                await Property.update(
                  {
                    parentId: newParentId,
                  },
                  {
                    where: {
                      id: newId,
                    },
                  }
                )
              })
            )
          })
        )
      })
    )

    await RedisService.delCache(CACHE_KEY.REPOSITORY_GET, repositoryId)
  }
}

function getMethodFromRAP1RequestType(type: number) {
  switch (type) {
    case 1:
      return 'GET'
    case 2:
      return 'POST'
    case 3:
      return 'PUT'
    case 4:
      return 'DELETE'
    default:
      return 'GET'
  }
}

interface JsonData {
  /**
   * 要导入的目标 repo id 名
   */
  id: number
  name?: string
  basePath?: string
  description?: string
  modules: Array<{
    name: string
    description?: string
    /**
     * 排序优先级
     * 从 1 开始，小的在前面
     */
    interfaces: Array<{
      name: string
      url: string
      /**
       * GET POST
       */
      method: string
      description?: string
      /**
       * 状态码
       */
      status: number
      /**
       * 标准属性数组
       */
      properties: Array<Partial<Property>>
      /**
       * 导入请求数据body类型
       */
      bodyOption?: string
      /**
       * 导入请求数据 json 字符串
       */
      requestJSON: string
      /**
       * 导入响应数据 json 字符串
       */
      responseJSON: string
    }>
  }>
}

interface OldParameter {
  id: number
  name: string
  mockData: string
  identifier: string
  remark: string
  dataType: string
  parameterList: OldParameter[]
  parentName: string
  depth: number
}

interface SwaggerParameter {
  name: string
  in: string
  description?: string
  required: boolean
  type: string
  allowEmptyValue?: boolean
  minLength?: number
  maxLength?: number
  format?: string
  minimum?: number
  maxinum?: number
  default?: any
  items?: SwaggerParameter[]
  collectionFormat?: string
  exclusiveMaximum?: number
  exclusiveMinimum?: number
  enum?: any[]
  multipleOf?: number
  uniqueItems?: boolean
  pattern?: string
  schema: any
  children: SwaggerParameter[]
  id: string
  depth: number
}

interface SwaggerTag {
  name: string
  description?: string
}

interface SwaggerInfo {
  description?: string
  title?: string
  version?: string
}

export interface SwaggerData {
  openapi?: string
  basePath?: string
  swagger: string
  host: string
  tags: SwaggerTag[]
  paths: object
  definitions?: object
  info?: SwaggerInfo
  schemes?: string[]
}
