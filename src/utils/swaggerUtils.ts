import { merge, omit } from 'lodash'
import { OpenAPIV2 } from 'openapi-types'
import * as JsonRefs from 'json-refs'

const Converter = require('api-spec-converter')

type SwaggerData = OpenAPIV2.Document
type SchemaObject = OpenAPIV2.SchemaObject
type DefinitionsObject = OpenAPIV2.DefinitionsObject
type PathsObject = OpenAPIV2.PathsObject
type ItemsObject = OpenAPIV2.ItemsObject
type PathItemObject = OpenAPIV2.PathItemObject
type OperationObject = OpenAPIV2.OperationObject
type Schema = OpenAPIV2.Schema
type Parameters = OpenAPIV2.Parameters[0]
type Response = OpenAPIV2.Response

export type SwaggerDataV2 = SwaggerData

/**
 * 把Swagger 2.0/OpenAPI 3.0数据统一转化为Swagger2.0格式
 * @param sourceData
 * @returns
 */
export async function convertToSwaggerV2(sourceData: string | object): Promise<SwaggerData> {
  // 解析数据源
  let source = null
  if (typeof sourceData === 'string') {
    try {
      source = JSON.parse(sourceData)
    } catch {
      // eslint-disable-line
    }
  } else {
    source = sourceData
  }

  // 数据源数据转化
  if (source?.swagger) {
    // Swagger 2.0，直接返回
    return source
  }

  if (source?.openapi?.startsWith('3.0')) {
    // OpenAPI 3.0，转化为Swagger 2.0
    const { spec } = await Converter.convert({
      from: 'openapi_3',
      to: 'swagger_2',
      source,
    })
    return spec
  }

  if (source?.openapi?.startsWith('3.1')) {
    // OpenAPI 3.1，暂时无法处理
    return null
  }

  // 其他
  return null
}


/**
 * 移除Swagger中的$ref
 * @param swagger
 * @param clearDefinitions 是否清空无用的definitions
 * @returns
 */
export async function removeSwaggerRefs(swagger: SwaggerData, clearDefinitions?: boolean): Promise<SwaggerData> {
  const { resolved } = await JsonRefs.resolveRefs(swagger)

  if (clearDefinitions) {
    return {
      ...resolved,
      definitions: {},
    } as SwaggerData
  }

  return resolved as SwaggerData
}

/**
 * 移除Swagger中的allOf/oneOf/anyOf
 * @param swagger
 * @returns
 */
export function removeSwaggerAllOf(swagger: SwaggerData): SwaggerData {
  const { definitions = {}, paths = {} } = swagger || {}

  // 去除definitions中的allOf/oneOf/anyOf
  const cacheDefinitions = Object.entries(definitions).reduce((cacheResult, [key, definition]) => {
    if (!cacheResult[key]) {
      cacheResult[key] = mergeAllOf(definition, definitions, cacheResult)
    }
    return cacheResult
  }, {} as DefinitionsObject)

  // 去除paths中的allOf/oneOf/anyOf
  const newPaths = Object.entries(paths).reduce((result, [path, pathItem]) => {
    result[path] = removePathItemAllOf(pathItem, cacheDefinitions)
    return result
  }, {} as PathsObject)

  return {
    ...swagger,
    definitions: cacheDefinitions,
    paths: newPaths,
  }
}

function mergeAllOf(definition: SchemaObject, definitions: DefinitionsObject, cacheResult: DefinitionsObject): SchemaObject {
  const {
    properties, // 对象类型
    items, // 数组类型
    allOf, oneOf, anyOf, // 复合类型
  } = definition

  // 处理对象数组类型
  if (items) {
    const oneItem = Array.isArray(items) ? items[0] : items
    return {
      ...definition,
      items: mergeAllOf(oneItem, definitions, cacheResult) as ItemsObject,
    }
  }

  if (properties) {
    return {
      ...definition,
      properties: Object.entries(properties).reduce((result, [key, item]) => {
        result[key] = mergeAllOf(item, definitions, cacheResult)
        return result
      }, {}),
    }
  }

  const newDefinition = omit(definition, ['allOf', 'oneOf', 'anyOf'])

  // 复合类型：oneOf/anyOf
  if (oneOf || anyOf) {
    const firstOne = (oneOf?.[0] || anyOf?.[0] || {}) as SchemaObject
    return {
      ...newDefinition,
      ...firstOne,
    }
  }

  // 复合类型：allOf
  if (allOf) {
    // 仅有一个，直接使用
    // if (allOf.length === 1) {
    //   return {
    //     ...newDefinition,
    //     ...allOf[0] as SchemaObject,
    //   }
    // }

    // 有多个定义，进行merge
    const refs = allOf.filter(item => !!item.$ref).map(item => item.$ref)
    const propertyMap = allOf.filter(item => !item.$ref).reduce((result, current) => {
      return merge(result, mergeAllOf(current as SchemaObject, definition, cacheResult))
    }, {} as SchemaObject['properties'])

    const refsProperties = refs.reduce((result, ref) => {
      const refName = ref.split('#/definitions/')[1]
      if (!cacheResult[refName]) {
        // 构造ref定义，并缓存
        const refData = mergeAllOf(definitions[refName], definitions, cacheResult)
        cacheResult[refName] = refData
      }

      // 使用缓存定义
      return merge(result, cacheResult[refName])
    }, propertyMap)

    return {
      ...newDefinition,
      ...refsProperties,
    }
  }

  return newDefinition
}

function removePathItemAllOf(pathItem: PathItemObject, cacheResult: DefinitionsObject): PathItemObject {
  return Object.entries(pathItem).reduce((result, [method, operation]) => {
    const { parameters, responses = {} } = operation as OperationObject

    const newParameters = parameters?.map(definition => mergePathAllOf<Parameters>(definition, cacheResult))
    const newResponses = Object.entries(responses).reduce((result, [statusCode, definition]) => {
      result[statusCode] = mergePathAllOf<Response>(definition, cacheResult)
      return result
    }, {})

    result[method] = {
      ...operation as OperationObject,
      parameters: newParameters,
      responses: newResponses,
    }
    return result
  }, {} as PathItemObject)
}

function mergePathAllOf<T extends { schema?: Schema; $ref?: string }>(definition: T, cacheResult: DefinitionsObject): T {
  if (!definition?.schema) {
    return definition
  }

  return {
    ...definition,
    schema: mergeAllOf(definition.schema, cacheResult, cacheResult),
  }
}
