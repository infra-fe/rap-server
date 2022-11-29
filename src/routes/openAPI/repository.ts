import * as Yup from 'yup'
import openRouter from './openRouter'

import InterfaceOpenService from '../../service/openAPI/interface'
import RepositoryOpenService, { RepositoryOpenServiceType } from '../../service/openAPI/repository'
import MigrateProcessService from '../../service/process/migrateService'

import OpenApiService from '../../service/export/openapi'
import RepositoryVersionService from '../../service/repositoryVersion'
import Tree from '../utils/tree'
import { BASE_TYPE_CHECK_SCHEMA, OPEN_API_STATUS_CODE } from './constant'

openRouter.all('/', (ctx) => {
  ctx.body = {
    data: {
      methos: ctx.method,
      url: ctx.url,
    },
  }
})

/**
 * 查询仓库（项目）列表。
 * 支持：1）仓库名模糊查询；2）所属人（团队）的仓库列表；3）分页查询下；
 */
const REPO_LIST_CHECK_SCHEMA = Yup.object({
  nameLike: Yup.string(),
  owners: Yup.string(),
  organizations: Yup.string(),
  start: Yup.number().integer().default(0).min(0),
  limit: Yup.number().integer().default(25).max(100),
  orderBy: Yup.string().matches(/^(DESC|ASC)$/, { excludeEmptyString: true }),
})
openRouter.get('/repository/list', async (ctx) => {

  // 1.提取并校验参数
  let params: RepositoryOpenServiceType.ListParams = null
  try {
    params = REPO_LIST_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
      message: `request params illegal: ${e.message}`,
    }
    return
  }

  let result = null
  let code = OPEN_API_STATUS_CODE.SUCCESS
  let message = ''
  try {
    // 2.获取数据结果
    result = await RepositoryOpenService.list(params)
  } catch (e) {
    code = OPEN_API_STATUS_CODE.SEVER_ERROR
    message = `server handle error: ${e.message}`
  } finally {
    // 3.返回数据结果
    ctx.body = {
      code,
      message,
      data: result,
    }

  }

})
/**
 * 查询仓库数据
 */
const REPO_DATA_CHECK_SCHEMA = Yup.object({
  id: Yup.number().required(),
  versionId: Yup.number().optional(),
  format: Yup.string().default('openapi'),
})
openRouter.get('/repository/data', async (ctx) => {

  // 1.提取并校验参数
  let params: RepositoryOpenServiceType.DataParams = null
  try {
    params = REPO_DATA_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
      message: `request params illegal: ${e.message}`,
    }
    return
  }

  let result = null
  let code = OPEN_API_STATUS_CODE.SUCCESS
  let message = ''
  try {
    let versionId = params.versionId || null
    const repositoryVersion = await RepositoryVersionService.findByPk(versionId, params.id)
    if (repositoryVersion) {
      versionId = repositoryVersion.id
    }
    // 2.获取数据结果
    if (params.format === 'openapi') {
      result = await OpenApiService.export(params.id, versionId)
    }
  } catch (e) {
    code = OPEN_API_STATUS_CODE.SEVER_ERROR
    message = `server handle error: ${e.message}`
  } finally {
    // 3.返回数据结果
    ctx.body = {
      code,
      message,
      data: result,
    }

  }

})
/**
 * 查询仓库（项目）的模块列表和接口列表。
 * 根据仓库ID，查询仓库中的模块列表和接口列表
 */
const REPO_GET_CHECK_SCHEMA = Yup.object({
  withoutModules: Yup.boolean(),
  withoutInterfaces: Yup.boolean(),
  versionName: Yup.string(),
})
openRouter.get('/repository/:id', async (ctx) => {
  // 1.参数提取和校验
  const id = +ctx.params.id
  try {
    BASE_TYPE_CHECK_SCHEMA.INT_ID.validateSync(id)
  } catch (e) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
      message: `request params illegal: 【id】- ${e.message}`,
    }
    return
  }

  let params: RepositoryOpenServiceType.GetParams = null
  try {
    params = REPO_GET_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = {
      data: {
        code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
        message: `request params illegal: ${e.message}`,
      },
    }
    return
  }

  let result = null
  let code = OPEN_API_STATUS_CODE.SUCCESS
  let message = ''
  try {
    // 2.获取数据
    result = await RepositoryOpenService.get(id, params)

    if (!result) {
      code = OPEN_API_STATUS_CODE.NO_DATA
      message = `no data: ${id}`
    }
  } catch (e) {
    code = OPEN_API_STATUS_CODE.SEVER_ERROR
    message = `server handle error: ${e.message}`
  } finally {
    // 3.返回数据结果
    ctx.body = {
      code,
      message,
      data: result,
    }

  }
})

/**
 * 查询接口定义详情。
 * 根据接口ID，查询接口的定义详情
 */
openRouter.get('/interface/:id', async (ctx) => {
  // 1.提取请求参数
  const id = +ctx.params.id

  // 2.参数校验
  try {
    BASE_TYPE_CHECK_SCHEMA.INT_ID.validateSync(id)
  } catch (e) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
      message: `request params illegal: 【id】- ${e.message}`,
    }
    return
  }

  let result = null
  let code = OPEN_API_STATUS_CODE.SUCCESS
  let message = ''
  try {
    // 3.获取数据结果
    result = await InterfaceOpenService.get(id)

    if (!result) {
      code = OPEN_API_STATUS_CODE.NO_DATA
      message = `no data: ${id}`
    }
  } catch (e) {
    code = OPEN_API_STATUS_CODE.SEVER_ERROR
    message = `server handle error: ${e.message}`
  } finally {
    // 4. 返回数据结果
    ctx.body = {
      code,
      message,
      data: result,
    }

  }

})

/**
 * 把接口数据导入指定的仓库（带token鉴权）
 */
const REPO_IMPORT_CHECK_SCHEMA = Yup.object({
  accessToken: Yup.string().required(),
  repositoryId: Yup.number().positive().integer().required(),
  mode: Yup.string().matches(/^(add|cover|clean)$/, { excludeEmptyString: true }),
  dataType: Yup.string().matches(/^(RAP|Swagger|YAPI|PB)$/, { excludeEmptyString: true }),
  async: Yup.boolean(),
  versionName: Yup.string(),
  data: Yup.object({}),
})
openRouter.post('/repository/import', async (ctx) => {
  const { accesstoken } = ctx.headers
  const { query, body } = ctx.request

  // 1.参数提取和校验
  let params = null
  try {
    params = REPO_IMPORT_CHECK_SCHEMA.validateSync({
      accessToken: accesstoken,
      repositoryId: +body.repositoryId || +query.repositoryId,
      mode: body.mode || query.mode || 'add',
      dataType: body.dataType || query.dataType || 'Swagger',
      async: body.async ?? query.async ?? true,
      versionName: body.versionName ?? query.versionName,
      data: body.data,
    })
  } catch (e) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
      message: `request params illegal: ${e.message}`,
    }
    return
  }

  // 2.1token鉴权
  const canAccess = await RepositoryOpenService.access(params.accessToken, params.repositoryId)
  if (!canAccess) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.NO_ACCESS,
      message: `access denied: access token doesn't match the repositoryId {${params.repositoryId}}`,
    }
    return
  }

  // 检测仓库是否启用版本管理
  if (params.versionName) {
    const mainVersion = await RepositoryVersionService.getMainVersion(params.repositoryId)
    if (!mainVersion) {
      ctx.body = {
        code: OPEN_API_STATUS_CODE.REJECT,
        message: `This repository hasn't been opened Version Management. Please initialize version on RAP Platform.`,
      }
      return
    }
  }

  // 2.2调用导入服务
  let response = null
  try {
    if (params.async === true) {
      MigrateProcessService.import(params)
      response = {
        code: OPEN_API_STATUS_CODE.SUCCESS,
        message: `importing by async method.`,
        data: null,
      }
    } else {
      const { result, code, msg } = await RepositoryOpenService.import(params)
      response = result
        ? {
          code: OPEN_API_STATUS_CODE.SUCCESS,
          message: `import success: ${msg || code}`,
          data: null,
        }
        : {
          code: OPEN_API_STATUS_CODE.REJECT,
          message: `import fail: ${code}`,
        }
    }
  } catch (e) {
    response = {
      code: OPEN_API_STATUS_CODE.SEVER_ERROR,
      message: `import error: ${e.message}`,
    }
  } finally {
    // 3.返回导入结果
    ctx.body = response
  }
})

/**
 * 查询接口定义详情（JSONSchema格式）
 */
openRouter.get('/interface/schema/:id', async (ctx) => {
  // 1.提取请求参数
  const id = +ctx.params.id

  // 2.参数校验
  try {
    BASE_TYPE_CHECK_SCHEMA.INT_ID.validateSync(id)
  } catch (e) {
    ctx.body = {
      code: OPEN_API_STATUS_CODE.PARAM_ILLEGAL,
      message: `request params illegal: 【id】- ${e.message}`,
    }
    return
  }

  let result = null
  let code = OPEN_API_STATUS_CODE.SUCCESS
  let message = ''
  try {
    // 3.获取数据结果
    result = await InterfaceOpenService.get(id)

    if (!result) {
      code = OPEN_API_STATUS_CODE.NO_DATA
      message = `no data: ${id}`
    } else {
      // 3.1获取JSONSchema数据
      const properties = result.properties || []

      result.properties = {
        reqHeader: await Tree.ArrayToStandardSchema(properties, 'reqHeader'),
        reqQuery: await Tree.ArrayToStandardSchema(properties, 'reqQuery'),
        reqBody: await Tree.ArrayToStandardSchema(properties, 'reqBody'),
        response: await Tree.ArrayToStandardSchema(properties, 'response'),
      }
    }
  } catch (e) {
    code = OPEN_API_STATUS_CODE.SEVER_ERROR
    message = `server handle error: ${e.message}`
  } finally {
    // 4. 返回数据结果
    ctx.body = {
      code,
      message,
      data: result,
    }
  }
})
