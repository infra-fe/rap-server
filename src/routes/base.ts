import * as _ from 'lodash'
import { ParameterizedContext } from 'koa'
import  { AccessUtils, ACCESS_TYPE } from './utils/access'
import * as Consts from './utils/const'

const inTestMode = process.env.TEST_MODE === 'true'


export async function isLoggedIn(ctx: ParameterizedContext<any, any>, next: () => Promise<any>) {
  if (!inTestMode && (!ctx.session || !ctx.session.id)) {
    ctx.body = {
      isOk: false,
      errMsg: 'need login',
    }
  } else {
    await next()
  }
}

export async function canUserAccessRepository(ctx: ParameterizedContext<any, any>, next: () => Promise<any>) {
  const {repositoryId} = ctx.request.body || ctx.request.query || ctx.request.params
  if (repositoryId === undefined || !await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, repositoryId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  await next()
}

