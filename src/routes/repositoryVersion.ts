/*
 * @Author: xia xian
 * @Date: 2022-08-10 14:10:12
 * @LastEditors: xia xian
 * @LastEditTime: 2022-08-19 10:43:34
 * @Description:
 */
import * as Yup from 'yup'
import RepositoryVersionService, { CreateParams, DeleteParams, ListParams } from '../service/repositoryVersion'
import router from './router'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import { COMMON_ERROR_RES } from './utils/const'

const LIST_CHECK_SCHEMA = Yup.object({
  repositoryId: Yup.number().integer(),
  name: Yup.string().optional(),
  start: Yup.number().integer().default(0).min(0),
  limit: Yup.number().integer().default(25).max(1000),
})

const CREATE_CHECK_SCHEMA = Yup.object({
  repositoryId: Yup.number().integer(),
  name: Yup.string(),
  target: Yup.string().optional(),
})

const DELETE_CHECK_SCHEMA = Yup.object({
  repositoryId: Yup.number().integer(),
  versionId: Yup.number().integer(),
})

const INIT_CHECK_SCHEMA = Yup.object({
  repositoryId: Yup.number().integer(),
})
router.get('/repository/version/list', async (ctx) => {
  const { id: curUserId } = ctx.session
  let params: ListParams = null
  try {
    params = LIST_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = COMMON_ERROR_RES.ERROR_PARAMS
    return
  }
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  let result = null
  try {
    const { total, list } = await RepositoryVersionService.findList(params)

    result = {
      isOk: true,
      data: { total, list },
    }
  } catch (error) {
    result = {
      isOk: false,
      errMsg: `error: ${error.message}`,
    }
  } finally {
    ctx.body = result
  }

})

router.post('/repository/version/create', async (ctx) => {
  const { id: curUserId } = ctx.session
  let params: CreateParams = null
  try {
    params = CREATE_CHECK_SCHEMA.validateSync(ctx.request.body)
  } catch (e) {
    ctx.body = COMMON_ERROR_RES.ERROR_PARAMS
    return
  }
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  let result = null
  try {
    const { success, created, message } = await RepositoryVersionService.create(params)
    result = {
      isOk: success && created,
      errMsg: message,
    }
  } catch (error) {
    result = {
      isOk: false,
      errMsg: `error: ${error.message}`,
    }
  } finally {
    ctx.body = result
  }

})

router.get('/repository/version/delete', async (ctx) => {
  const { id: curUserId } = ctx.session
  let params: DeleteParams = null
  try {
    params = DELETE_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = COMMON_ERROR_RES.ERROR_PARAMS
    return
  }
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  let result = null
  try {
    await RepositoryVersionService.delete(params)
    result = {
      isOk: true,
      errMsg: '',
    }
  } catch (error) {
    result = {
      isOk: false,
      errMsg: `error: ${error.message}`,
    }
  } finally {
    ctx.body = result
  }
})

router.get('/repository/version/init', async (ctx) => {
  const { id: curUserId } = ctx.session
  let params: { repositoryId: number } = null
  try {
    params = INIT_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = COMMON_ERROR_RES.ERROR_PARAMS
    return
  }
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  let result = null
  try {
    const masterVersion = await RepositoryVersionService.init(params.repositoryId)
    result = {
      isOk: true,
      errMsg: '',
      data: masterVersion,
    }
  } catch (error) {
    result = {
      isOk: false,
      errMsg: `error: ${error.message}`,
    }
  } finally {
    ctx.body = result
  }

})
