import * as Yup from 'yup'
import TagService, { TagServiceType } from '../service/tag'
import router from './router'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import { COMMON_ERROR_RES } from './utils/const'

/**
 * 创建新标签
 */
const TAG_CREATE_CHECK_SCHEMA = Yup.object({
  name: Yup.string().trim().required().max(64),
  level: Yup.string().required().matches(/^(system|repository)$/),
  repositoryId: Yup.number().integer().min(1).required(),
  color: Yup.string(),
})
router.post('/tag/create', async (ctx) => {
  // 参数校验和提取
  let params: TagServiceType.CreateParams = null
  try {
    params = TAG_CREATE_CHECK_SCHEMA.validateSync(ctx.request.body)
  } catch (e) {
    ctx.body = {
      isOk: false,
      errMsg: e.message,
    }
    return
  }
  const { id: curUserId } = ctx.session
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  // 数据保存
  try {
    const result = await TagService.save(params)

    ctx.body = {
      isOk: true,
      data: result,
    }
  } catch (e) {
    ctx.body = {
      isOk: false,
      errMsg: e.message,
    }
  }

})

/**
 * 获取标签列表
 */
const TAG_LIST_CHECK_SCHEMA = Yup.object({
  repositoryId: Yup.number().integer().required().min(1),
  start: Yup.number().integer().default(0).min(0),
  limit: Yup.number().integer().default(25).max(100),
})
router.get('/tag/list', async (ctx) => {
  // 参数校验和提取
  let params: TagServiceType.ListParams = null
  try {
    params = TAG_LIST_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = {
      isOk: false,
      errMsg: e.message,
    }
    return
  }
  const { id: curUserId } = ctx.session
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  // 查询数据
  try {
    const result = await TagService.list(params)

    ctx.body = {
      isOk: true,
      data: result,
    }
  } catch (e) {
    ctx.body = {
      isOk: false,
      errMsg: e.message,
    }
  }

})

const TAG_REMOVE_CHECK_SCHEMA = Yup.object({
  repositoryId: Yup.number().integer().required(),
  tagId: Yup.number().integer().required(),
})
router.get('/tag/remove', async (ctx) => {
  // 参数校验和提取
  let params: TagServiceType.RemoveParams = null
  try {
    params = TAG_REMOVE_CHECK_SCHEMA.validateSync(ctx.query)
  } catch (e) {
    ctx.body = {
      isOk: false,
      errMsg: e.message,
    }
    return
  }
  const { id: curUserId } = ctx.session
  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, params.repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  // 查询数据
  try {
    const result = await TagService.remove(params)

    ctx.body = {
      isOk: true,
      data: result,
    }
  } catch (e) {
    ctx.body = {
      isOk: false,
      errMsg: e.message,
    }
  }

})
