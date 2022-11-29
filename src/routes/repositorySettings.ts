import router from './router'
import { nanoid } from 'nanoid'
import RepositoryService from '../service/repository'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import { COMMON_ERROR_RES } from './utils/const'

router.post('/repository/settings/token/update', async (ctx) => {
  const { id } = ctx.query
  const { id: curUserId } = ctx.session
  const repositoryId = +id

  const canAccess = await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, curUserId, repositoryId)
  if (!canAccess) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  if (!repositoryId || repositoryId <= 0) {
    ctx.body = COMMON_ERROR_RES.ERROR_PARAMS
    return
  }

  let result = null
  try {
    const newToken = nanoid(32)
    await RepositoryService.updateRepositoryToken(repositoryId, newToken)

    result = {
      isOk: true,
      data: { id: repositoryId, token: newToken },
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
