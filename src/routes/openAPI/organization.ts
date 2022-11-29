import * as Yup from 'yup'
import openRouter from './openRouter'

import OrganizationOpenService, { OrganizationOpenServiceType } from '../../service/openAPI/organization'

import { OPEN_API_STATUS_CODE } from './constant'

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
openRouter.get('/organization/list', async (ctx) => {

  // 1.提取并校验参数
  let params: OrganizationOpenServiceType.ListParams = null
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
    result = await OrganizationOpenService.list(params)
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

