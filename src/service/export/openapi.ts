import { OpenAPI3Collection, TagObject, PathItemObject, ParameterObject, Properties, RequestBody, Responses, SchemaObject } from '../../types/openapi'
import { Repository, Interface, Module, Property } from '../../models'
import { POS_TYPE } from '../../models/bo/property'
import UrlUtils from '../../routes/utils/url'
import { BODY_OPTION } from '../../routes/utils/const'
import Tree from '../../routes/utils/tree'
// https://swagger.io/specification/ version 3.0.3 is compatible with swagger
const VERSION = '3.0.3'
export default class OpenApiService {
  public static async export(repositoryId: number): Promise<OpenAPI3Collection> {
    const repo = await Repository.findByPk(repositoryId, {
      include: [{
        model: Module,
        as: 'modules',
        include: [{
          model: Interface,
          as: 'interfaces',
          include: [{
            model: Property,
            as: 'properties',
          }],
        }],
      }],
    })
    const result: OpenAPI3Collection = {
      openapi: VERSION,
      tags: [],
      info: {
        title: `RAP2 Pack ${repo.name}`,
        version: '1.0.0',
        description: `${repo.description}`,
      },
      paths: {},
      components: { schemas: {} },
    }
    const schemas: Properties = {}
    const urls = new Set<string>()
    for (const mod of repo.modules) {
      const modItem: TagObject = {
        name: mod.name,
        description: mod.description,
      }
      result.tags.push(modItem)
      for (const itf of mod.interfaces) {
        const interfaceId = itf.id
        const scopeProperties = await Property.findAll({
          where: { interfaceId },
        })
        const propertyTree = Tree.ArrayToTree(scopeProperties).children
        let itfItem: PathItemObject = {}
        const parameterItem: ParameterObject[] = []
        const properties: Properties = {}
        const responses: Responses = {}
        const resComponents: Properties = {}
        // handle parameters in path like /{id}/
        const hostname = itf.url.match(/(\w+):\/\/([^/:]+)(:\d*)?/)
        if (hostname) {
          urls.add(hostname[0])
        }
        const relativeUrl = UrlUtils.getRelative(itf.url).replace(/\:(\w*)/g, '{$1}')
        relativeUrl.replace(/{(\w*)}/g, (match, p) => {
          parameterItem.push({
            name: p,
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          })
          return match
        })
        if (result.paths[relativeUrl]) {
          itfItem = result.paths[relativeUrl]
        } else {
          result.paths[relativeUrl] = itfItem
        }
        const method = itf.method.toLocaleLowerCase()
        // same path and same method is not allowed
        if (!itfItem[method]) {
          schemas[`ApiResponse${itf.id}`] = {
            type: 'object',
            properties: resComponents,
          }
          responses[itf.status] = {
            description: itf.description || 'example',
            content: {
              'application/json': {
                'schema': {
                  '$ref': `#/components/schemas/ApiResponse${itf.id}`,
                },
              },
            },
          }
          // handle parameters in query like ?id=###
          if (itf.url.indexOf('?') > 0) {
            const params = new URLSearchParams(itf.url.substring(itf.url.indexOf('?') + 1))
            for (const [name, value] of params) {
              parameterItem.push({
                name: name,
                in: 'query',
                required: false,
                schema: {
                  type: 'string',
                  format: value,
                },
              })
            }
          }
          // handle parameters
          propertyTree.forEach(x => {
            const { pos, scope } = x
            if (scope === 'request') {
              switch (pos) {
                case null: case POS_TYPE.QUERY: case POS_TYPE.HEADER:
                  parameterItem.push({
                    name: x.name,
                    in: pos === POS_TYPE.HEADER ? 'header' : 'query',
                    required: x.required ?? false,
                    schema: getSchema(x, schemas),
                  })
                  break
                case POS_TYPE.BODY:
                  properties[x.name] = getSchema(x, schemas)
                  break
                default: break
              }
            } else if (scope === 'response') {
              resComponents[x.name] = getSchema(x, schemas)
            }
          })
          itfItem[method] = {
            tags: [mod.name],
            summary: itf.name,
            description: itf.description,
            parameters: parameterItem,
            responses: responses,
          }
          if (Object.keys(properties).length > 0) {
            const reqBody: RequestBody = { content: {} }
            reqBody.content[getMedia(itf.bodyOption)] = {
              schema: {
                properties: properties,
              },
            }
            itfItem[method]['requestBody'] = reqBody
          }
        }
      }
    }
    result.components.schemas = schemas
    if (urls.size > 0) {
      result['servers'] = [...urls].map(x => { return { url: x } })
    }
    return result
  }
}
function getType(type: string) {
  if (/RegExp|Function|Null/.test(type)) {return 'string'}
  return type.toLocaleLowerCase()
}
function getValue(value: string) {
  const result = {}
  if (value) {
    result['default'] = value
  }
  const match = /@(\w+)\((\d+)?,?(\d+)?\)/g.exec(value)
  if (match) {
    const [_, type, min, max] = match
    switch (type) {
      case 'time': case 'date': case 'now':
        result['format'] = 'date'
        break
      case 'datetime':
        result['format'] = 'date-time'
        break
      case 'integer': case 'natural':
        result['format'] = 'int32'
        if (min) {result['minimum'] = parseInt(min)}
        if (max) {result['maxmum'] = parseInt(max)}
        break
      case 'float':
        result['format'] = 'int32'
        if (min) {result['minimum'] = parseFloat(min)}
        if (max) {result['maxmum'] = parseFloat(max)}
        break
      default:
        break
    }
  } else if (!isNaN(Date.parse(value))) {
    result['format'] = 'date'
  } else if (!isNaN(parseInt(value))) {
    result['format'] = 'int32'
  }
  return result
}
function getSchema(property: any, schemas: Properties) {
  const { rule, value, id, description, children } = property
  const type = getType(property.type)
  const schema: SchemaObject = {
    type: type,
    description: `${description}${rule ? `|${rule}` : ''}`,
  }
  if (type === 'array' || type === 'object') {
    if (children.length > 0) {
      const ref = `ApiProperty${id}`
      schema['items'] = {
        '$ref': `#/components/schemas/${ref}`,
      }
      const itemSchema = {
        type: 'object',
        properties: {},
      }
      children.forEach(x => {
        itemSchema.properties[x.name] = getSchema(x, schemas)
      })
      schemas[ref] = itemSchema
    } else {
      schema['items'] = { type: 'string' }
    }
  }
  return { ...schema, ...getValue(value?.trim()) }
}
function getMedia(option: string) {
  switch (option) {
    case BODY_OPTION.FORM_DATA:
      return 'multipart/form-data'
    case BODY_OPTION.FORM_URLENCODED:
      return 'application/x-www-from-urlencoded'
    case BODY_OPTION.BINARY:
      return 'application/octet-stream'
    default:
      return 'text/plain'
  }
}
