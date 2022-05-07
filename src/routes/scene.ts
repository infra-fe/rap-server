import router from './router'
import * as JSON5 from 'json5'
import { isLoggedIn } from './base'
import { Scene } from '../models'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import * as Consts from './utils/const'

router.post('/scene/create', isLoggedIn, async (ctx) => {
  const { body } = ctx.request
  const now = Math.floor(Date.now() / 1000)
  body.priority = now
  body.createdAt = now
  body.updatedAt = now
  const created = await Scene.create(body)
  await Scene.update(
    {...created, sceneKey: 'scene_' + created.id, sceneName: 'scene_' + created.id},
    {where: {id: created.id}}
  )
  ctx.body = {
    data: await Scene.findByPk(created.id),
  }
})

router.get('/scene/list', async (ctx) => {
  const { interfaceId } = ctx.query
  if (!(await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_GET, ctx.session.id, +interfaceId))) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  ctx.body = {
    data: await Scene.findAll({
      attributes: { exclude: ['headers', 'sceneData', 'sceneKey'] },
      where: { interfaceId, deletedAt: null },
      order: [['id', 'DESC']],
    }),
  }
})

router.get('/scene/get', async (ctx) => {
  const { id } = ctx.query
  const { interfaceId } = await Scene.findByPk(+id)
  if (!(await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_GET, ctx.session.id, +interfaceId))) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  ctx.body = {
    data: await Scene.findByPk(+id),
  }
})

router.post('/scene/update', isLoggedIn, async (ctx) => {
  const { body } = ctx.request
  const { sceneKey, interfaceId, sceneData } = body
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, +interfaceId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  if (sceneKey) {
    const duplicate =  await Scene.findAll({
      where: { sceneKey, interfaceId, deletedAt: null },
    })
    if (duplicate.length) {
      ctx.body = {
        isOk: false,
        errMsg: '场景Key重复',
      }
      return
    }
  }
  if (sceneData) {
    try {
      JSON5.parse(sceneData)
    } catch (e) {
      ctx.body = {
        isOk: false,
        errMsg: '数据格式错误',
      }
      return
    }
  }
  body.updatedAt = Math.floor(Date.now() / 1000)
  await Scene.update(body, { where: { id: body.id } })
  ctx.body = {
    data: {
      id: body.id,
      message: '场景更新成功',
    },
  }
})

router.get('/scene/remove', isLoggedIn, async (ctx) => {
  const id  = +ctx.query.id
  const { interfaceId } = await Scene.findByPk(+id)
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, +interfaceId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const now = Math.floor(Date.now() / 1000)
  ctx.body = {
    data: await Scene.update({deletedAt: now}, {
      where: { id },
    }),
  }
})
