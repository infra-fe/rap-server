// TODO 2.1 大数据测试，含有大量模块、接口、属性的仓库
import { Op } from 'sequelize'
import * as _ from 'underscore'
import * as Yup from 'yup'
import { DefaultVal, Interface, InterfacesTags, Logger, Module, Organization, Property, QueryInclude, Repository, Tag, User } from '../models'
import MigrateService, { COVER_TYPE } from '../service/migrate'
import OrganizationService from '../service/organization'
import MigrateProcessService from '../service/process/migrateService'
import RedisService, { CACHE_KEY } from '../service/redis'
import RepositoryService from '../service/repository'
import { isLoggedIn } from './base'
import router from './router'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import * as Consts from './utils/const'
import Pagination from './utils/pagination'
import Tree from './utils/tree'

import * as JSON5 from 'json5'
import { nanoid } from 'nanoid'
import { LOG_SEPERATOR } from '../models/bo/historyLog'
import { MoveOp } from '../models/bo/interface'
import RepositoryVersionService from '../service/repositoryVersion'
import { IPager } from '../types'
import { COMMON_ERROR_RES, ENTITY_TYPE } from './utils/const'
import { initModule, initRepository } from './utils/helper'
import { deleteImportByRepositoryId } from '../service/autoImport'
import sequelize from '../models/sequelize'
import { deleteImportJobs } from '../service/autoImportQueue'

router.get('/app/get', async (ctx, next) => {
  const data: any = {}
  const query = ctx.query
  const hooks: any = {
    repository: Repository,
    module: Module,
    interface: Interface,
    property: Property,
    user: User,
  }
  for (const name in hooks) {
    if (!query[name]) { continue }
    data[name] = await hooks[name].findByPk(query[name])
  }
  ctx.body = {
    data: Object.assign({}, ctx.body && ctx.body.data, data),
  }

  return next()
})

router.get('/repository/count', async (ctx) => {
  ctx.body = {
    data: await Repository.count(),
  }
})

router.get('/repository/list', async (ctx) => {
  const where = {}
  const { name, user, organization } = ctx.query

  if (+organization > 0) {
    const access = await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_GET, ctx.session.id, +organization)

    if (access === false) {
      ctx.body = {
        isOk: false,
        errMsg: Consts.COMMON_MSGS.ACCESS_DENY,
      }
      return
    }
  }

  // tslint:disable-next-line:no-null-keyword
  if (user) { Object.assign(where, { ownerId: user, organizationId: null }) }
  if (organization) { Object.assign(where, { organizationId: organization }) }
  if (name) {
    Object.assign(where, {
      [Op.or]: [
        { name: { [Op.like]: `%${name}%` } },
        { id: name }, // name => id
      ],
    })
  }
  const total = await Repository.count({
    where,
    include: [
      QueryInclude.Creator,
      QueryInclude.Owner,
      QueryInclude.Locker,
    ],
  })
  const limit = Math.min(+ctx.query.limit ?? 10, 100)
  const pagination = new Pagination(total, ctx.query.cursor || 1, limit)
  const repositories = await Repository.findAll({
    where,
    attributes: { exclude: [] },
    include: [
      QueryInclude.Creator,
      QueryInclude.Owner,
      QueryInclude.Locker,
      QueryInclude.Members,
      QueryInclude.Organization,
      QueryInclude.Collaborators,
    ],
    offset: pagination.start,
    limit: pagination.limit,
    order: [['updatedAt', 'DESC']],
  })
  const repoData = await Promise.all(repositories.map(async (repo) => {
    const canUserEdit = await AccessUtils.canUserEdit(
      ACCESS_TYPE.REPOSITORY_SET,
      ctx.session.id,
      repo.id
    )
    return {
      ...repo.toJSON(),
      canUserEdit,
    }
  }))
  ctx.body = {
    isOk: true,
    data: repoData,
    pagination: pagination,
  }
})

router.get('/repository/owned', isLoggedIn, async (ctx) => {
  const where = {}
  const { name } = ctx.query
  if (name) {
    Object.assign(where, {
      [Op.or]: [
        { name: { [Op.like]: `%${name}%` } },
        { id: name }, // name => id
      ],
    })
  }

  const auth: User = await User.findByPk(ctx.query.user || ctx.session.id)

  const repositories = await auth.$get('ownedRepositories', {
    where,
    include: [
      QueryInclude.Creator,
      QueryInclude.Owner,
      QueryInclude.Locker,
      QueryInclude.Members,
      QueryInclude.Organization,
      QueryInclude.Collaborators,
    ],
    order: [['updatedAt', 'DESC']],
  })
  const repoData = repositories.map(repo => {
    return {
      ...repo.toJSON(),
      canUserEdit: true,
    }
  })
  ctx.body = {
    data: repoData,
    pagination: undefined,
  }
})

router.get('/repository/joined', isLoggedIn, async (ctx) => {
  const where: any = {}
  const { name } = ctx.query
  if (name) {
    Object.assign(where, {
      [Op.or]: [
        { name: { [Op.like]: `%${name}%` } },
        { id: name }, // name => id
      ],
    })
  }

  const auth = await User.findByPk(ctx.query.user || ctx.session.id)
  const repositories = await auth.$get('joinedRepositories', {
    where,
    attributes: { exclude: [] },
    include: [
      QueryInclude.Creator,
      QueryInclude.Owner,
      QueryInclude.Locker,
      QueryInclude.Members,
      QueryInclude.Organization,
      QueryInclude.Collaborators,
    ],
    order: [['updatedAt', 'DESC']],
  })
  const repoData = repositories.map(repo => {
    return {
      ...repo.toJSON(),
      canUserEdit: true,
    }
  })
  ctx.body = {
    data: repoData,
    pagination: undefined,
  }
})

router.get('/repository/get', async (ctx) => {
  const access = await AccessUtils.canUserAccess(
    ACCESS_TYPE.REPOSITORY_GET,
    ctx.session.id,
    +ctx.query.id,
    ctx.query.token as string
  )
  if (access === false) {
    ctx.body = {
      isOk: false,
      errMsg: Consts.COMMON_MSGS.ACCESS_DENY,
    }
    return
  }
  const excludeProperty = ctx.query.excludeProperty || false
  const canUserEdit = await AccessUtils.canUserEdit(
    ACCESS_TYPE.REPOSITORY_SET,
    ctx.session.id,
    +ctx.query.id
  )
  let versionId = null
  if (ctx.query.versionId) {
    try {
      versionId = Yup.object({
        versionId: Yup.number().optional(),
      }).validateSync(ctx.query).versionId
    } catch (e) {
      ctx.body = COMMON_ERROR_RES.ERROR_PARAMS
      return
    }
  }
  // 分开查询减少查询时间
  const QueryWithVersion = excludeProperty
    ? QueryInclude.RepositoryHierarchyExcludeProperty
    : QueryInclude.RepositoryHierarchy
  const repositoryId = +ctx.query.id
  const repositoryVersion = await RepositoryVersionService.findByPk(versionId, repositoryId)
  if (repositoryVersion) {
    versionId = repositoryVersion.id
  }
  const [repositoryOmitModules, repositoryModules] = await Promise.all([
    Repository.findByPk(repositoryId, {
      attributes: { exclude: [] },
      include: [
        QueryInclude.Creator,
        QueryInclude.Owner,
        QueryInclude.Locker,
        QueryInclude.Members,
        QueryInclude.Organization,
        QueryInclude.Collaborators,
      ],
    }),
    Repository.findByPk(repositoryId, {
      attributes: { exclude: [] },
      include: [
        {...QueryWithVersion, where: {versionId}},
      ],
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
  const version = repositoryVersion ? _.omit(repositoryVersion, ['repositoryId', 'deletedAt', 'createdAt']) : null

  const repositoryModulesJSON = repositoryModules.toJSON()
  repositoryModulesJSON.modules?.forEach(module => {
    module.interfaces?.forEach((itf) => {
      itf.tags?.forEach(tag => {
        delete tag['InterfacesTags']
      })
    })
  })

  const repository: Partial<Repository> & { canUserEdit: boolean } = {
    ...repositoryOmitModules.toJSON(),
    ...repositoryModulesJSON,
    version,
    canUserEdit,
  }

  ctx.body = {
    data: repository,
  }
})

router.post('/repository/create', isLoggedIn, async (ctx, next) => {
  const creatorId = ctx.session.id
  const lang = (ctx.cookies.get('i18next') || 'en').substring(0, 2)
  const body = Object.assign({}, ctx.request.body, {
    creatorId,
    ownerId: creatorId,
    token: nanoid(32),
  })
  const created = await Repository.create(body)
  if (body.memberIds) {
    const members = await User.findAll({ where: { id: body.memberIds } })
    await created.$set('members', members)
  }
  if (body.collaboratorIds) {
    const collaborators = await Repository.findAll({ where: { id: body.collaboratorIds } })
    await created.$set('collaborators', collaborators)
  }
  await initRepository(created, lang)
  ctx.body = {
    data: await Repository.findByPk(created.id, {
      attributes: { exclude: [] },
      include: [
        QueryInclude.Creator,
        QueryInclude.Owner,
        QueryInclude.Locker,
        QueryInclude.Members,
        QueryInclude.Organization,
        QueryInclude.RepositoryHierarchy,
        QueryInclude.Collaborators,
      ],
    } as any),
  }
  return next()
}, async (ctx) => {
  await Logger.create({
    userId: ctx.session.id,
    type: 'create',
    repositoryId: ctx.body.data.id,
  })
})

router.post('/repository/update', isLoggedIn, async (ctx, next) => {
  const body = Object.assign({}, ctx.request.body)
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, body.id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const repo = await Repository.findByPk(body.id)

  // 更改团队需要校验是否有当前团队和目标团队的权限
  if (body.organizationId !== repo.organizationId) {

    if (body.organizationId && !(await OrganizationService.canUserAccessOrganization(ctx.session.id, body.organizationId))) {
      ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
      return
    }

    if (repo.organizationId && !(await OrganizationService.canUserAccessOrganization(ctx.session.id, repo.organizationId))) {
      ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
      return
    }
  }

  delete body.creatorId

  const result = await Repository.update(body, { where: { id: body.id } })
  if (body.memberIds) {
    const reloaded = await Repository.findByPk(body.id, {
      include: [{
        model: User,
        as: 'members',
      }],
    })
    const members = await User.findAll({
      where: {
        id: {
          [Op.in]: body.memberIds,
        },
      },
    })
    ctx.prevAssociations = reloaded.members
    reloaded.$set('members', members)
    await reloaded.save()
    ctx.nextAssociations = reloaded.members
  }
  if (body.collaboratorIds) {
    const reloaded = await Repository.findByPk(body.id)
    const collaborators = await Repository.findAll({
      where: {
        id: {
          [Op.in]: body.collaboratorIds,
        },
      },
    })
    reloaded.$set('collaborators', collaborators)
    await reloaded.save()
  }
  ctx.body = {
    data: result[0],
  }
  return next()
}, async (ctx) => {
  const { id } = ctx.request.body
  await Logger.create({
    userId: ctx.session.id,
    type: 'update',
    repositoryId: id,
  })
  // 加入 & 退出
  if (!ctx.prevAssociations || !ctx.nextAssociations) { return }
  const prevIds = ctx.prevAssociations.map((item: any) => item.id)
  const nextIds = ctx.nextAssociations.map((item: any) => item.id)
  const joined: number[] = _.difference(nextIds, prevIds)
  const exited: number[] = _.difference(prevIds, nextIds)
  const creatorId = ctx.session.id
  for (const userId of joined) {
    await Logger.create({ creatorId, userId, type: 'join', repositoryId: id })
  }
  for (const userId of exited) {
    await Logger.create({ creatorId, userId, type: 'exit', repositoryId: id })
  }
})

router.post('/repository/transfer', isLoggedIn, async (ctx) => {
  const { id, ownerId, organizationId } = ctx.request.body
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_SET, ctx.session.id, organizationId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const body: any = {}
  if (ownerId) { body.ownerId = ownerId } // 转移给其他用户
  if (organizationId) {
    body.organizationId = organizationId // 转移给其他团队，同时转移给该团队拥有者
    body.ownerId = (await Organization.findByPk(organizationId)).ownerId
  }
  const result = await Repository.update(body, { where: { id } })
  ctx.body = {
    data: result[0],
  }
})

router.get('/repository/remove', isLoggedIn, async (ctx, next) => {
  const id = +ctx.query.id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const t = await sequelize.transaction()
  try {
    const result = await Repository.destroy({ where: { id }, transaction: t })
    await Module.destroy({ where: { repositoryId: id }, transaction: t })
    await Interface.destroy({ where: { repositoryId: id }, transaction: t })
    await Property.destroy({ where: { repositoryId: id }, transaction: t })
    const importIdList = await deleteImportByRepositoryId(id, t)
    deleteImportJobs(importIdList)
    ctx.body = {
      data: result,
    }
    await t.commit()

  } catch(e) {
    await t.rollback()
    throw e
  }

  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) { return }
  const { id } = ctx.query
  await Logger.create({
    userId: ctx.session.id,
    type: 'delete',
    repositoryId: +id,
  })
})

// TOEO 锁定/解锁仓库 待测试
router.post('/repository/lock', isLoggedIn, async (ctx) => {
  const id = +ctx.request.body.id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const user = ctx.session.id
  if (!user) {
    ctx.body = { data: 0 }
    return
  }
  const result = await Repository.update({ lockerId: user }, {
    where: { id },
  })
  ctx.body = { data: result[0] }
})

router.post('/repository/unlock', async (ctx) => {
  if (!ctx.session.id) {
    ctx.body = { data: 0 }
    return
  }
  const { id } = ctx.request.body
  // tslint:disable-next-line:no-null-keyword
  const result = await Repository.update({ lockerId: null }, {
    where: { id },
  })
  ctx.body = { data: result[0] }
})

// 模块
router.get('/module/count', async (ctx) => {
  ctx.body = {
    data: await Module.count(),
  }
})

router.get('/module/list', async (ctx) => {
  const where: any = {}
  const { repositoryId, name, versionId } = ctx.query
  if (repositoryId) { where.repositoryId = repositoryId }
  if (name) { where.name = { [Op.like]: `%${name}%` } }
  where.versionId = versionId || null
  if (repositoryId && !versionId) {
    const repositoryVersion = await RepositoryVersionService.findByPk(null, +repositoryId)
    if (repositoryVersion) {
      where.versionId = repositoryVersion.id
    }
  }

  ctx.body = {
    data: await Module.findAll({
      attributes: { exclude: [] },
      where,
    }),
  }
})

router.get('/module/get', async (ctx) => {
  ctx.body = {
    data: await Module.findByPk(+ctx.query.id, {
      attributes: { exclude: [] },
    }),
  }
})

router.post('/module/create', isLoggedIn, async (ctx, next) => {
  const creatorId = ctx.session.id
  const lang = (ctx.cookies.get('i18next') || 'en').substring(0, 2)
  const body = Object.assign(ctx.request.body, { creatorId })
  body.priority = Date.now()
  const created = await Module.create(body)
  await initModule(created, lang)
  ctx.body = {
    data: await Module.findByPk(created.id),
  }
  return next()
}, async (ctx) => {
  const mod = ctx.body.data
  await Logger.create({
    userId: ctx.session.id,
    type: 'create',
    repositoryId: mod.repositoryId,
    moduleId: mod.id,
  })
})

router.post('/module/update', isLoggedIn, async (ctx, next) => {
  const { id, name, description } = ctx.request.body
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.MODULE_SET, ctx.session.id, +id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const mod = await Module.findByPk(id)
  await mod.update({ name, description })
  ctx.request.body.repositoryId = mod.repositoryId
  ctx.body = {
    data: {
      id,
      name,
      description,
    },
  }
  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) { return }
  const mod = ctx.request.body
  await Logger.create({
    userId: ctx.session.id,
    type: 'update',
    repositoryId: mod.repositoryId,
    moduleId: mod.id,
  })
})

router.post('/module/move', isLoggedIn, async ctx => {
  const { modId, op, versionId } = ctx.request.body
  const repositoryId = ctx.request.body.repositoryId

  if (!(await RepositoryService.canUserMoveModule(ctx.session.id, modId, repositoryId))) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  await RepositoryService.moveModule(op, modId, repositoryId, '副本', versionId || null)

  ctx.body = {
    data: {
      isOk: true,
    },
  }
})

router.get('/module/remove', isLoggedIn, async (ctx, next) => {
  const { id } = ctx.query
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.MODULE_SET, ctx.session.id, +id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const result = await Module.destroy({ where: { id } })
  await Interface.destroy({ where: { moduleId: id } })
  await Property.destroy({ where: { moduleId: id } })
  ctx.body = {
    data: result,
  }
  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) { return }
  const id = +ctx.query.id
  const mod = await Module.findByPk(id, { paranoid: false })
  await Logger.create({
    userId: ctx.session.id,
    type: 'delete',
    repositoryId: mod.repositoryId,
    moduleId: mod.id,
  })
})

router.post('/module/sort', isLoggedIn, async (ctx) => {
  const { ids } = ctx.request.body
  let counter = 1
  for (let index = 0; index < ids.length; index++) {
    await Module.update({ priority: counter++ }, {
      where: { id: ids[index] },
    })
  }
  if (ids && ids.length) {
    const mod = await Module.findByPk(ids[0])
    await RedisService.delCache(CACHE_KEY.REPOSITORY_GET, mod.repositoryId)
  }
  ctx.body = {
    data: ids.length,
  }
})

router.get('/interface/count', async (ctx) => {
  ctx.body = {
    data: await Interface.count(),
  }
})

router.get('/interface/list', async (ctx) => {
  const where: any = {}
  const { repositoryId, moduleId, name } = ctx.query
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_GET, ctx.session.id, +repositoryId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  if (repositoryId) { where.repositoryId = repositoryId }
  if (moduleId) { where.moduleId = moduleId }
  if (name) { where.name = { [Op.like]: `%${name}%` } }
  ctx.body = {
    data: await Interface.findAll({
      attributes: { exclude: [] },
      where,
    }),
  }
})

router.get('/repository/defaultVal/get/:id', async (ctx) => {
  const repositoryId: number = +ctx.params.id
  ctx.body = {
    data: await DefaultVal.findAll({ where: { repositoryId } }),
  }
})

router.post('/repository/defaultVal/update/:id', async (ctx) => {
  const repositoryId: number = +ctx.params.id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, repositoryId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const list = ctx.request.body.list.map(x => { const { id, ...y } = x; return y })
  if (!(repositoryId > 0) || !list) {
    ctx.body = Consts.COMMON_ERROR_RES.ERROR_PARAMS
    return
  }
  await DefaultVal.destroy({
    where: { repositoryId },
  })
  for (const item of list) {
    await DefaultVal.create({
      ...item,
      repositoryId,
    })
  }

  ctx.body = {
    isOk: true,
  }
})

router.get('/interface/get', async (ctx) => {
  const id = +ctx.query.id

  if (id === undefined || !id) {
    ctx.body = {
      isOk: false,
      errMsg: '请输入参数id',
    }
    return
  }

  const itf = await Interface.findByPk(id, {
    include: [QueryInclude.Locker, QueryInclude.SimpleTag],
    attributes: { exclude: [] },
  })

  if (!itf) {
    ctx.body = {
      isOk: false,
      errMsg: `没有找到 id 为 ${id} 的接口`,
    }
    return
  }

  if (
    !(await AccessUtils.canUserAccess(
      ACCESS_TYPE.REPOSITORY_GET,
      ctx.session.id,
      itf.repositoryId
    ))
  ) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  const itfJSON = itf.toJSON()
  itfJSON.tags?.forEach(tag => {
    delete tag['InterfacesTags']
  })

  let properties: any[] = await Property.findAll({
    attributes: { exclude: [] },
    where: { interfaceId: itf.id },
  })

  properties = properties.map((item: any) => item.toJSON())
  itfJSON['properties'] = properties

  const scopes = ['request', 'response']
  for (let i = 0; i < scopes.length; i++) {
    const scopeProperties = properties
      .filter(p => p.scope === scopes[i])
      .map((item: any) => ({ ...item }))
    itfJSON[scopes[i] + 'Properties'] = Tree.ArrayToTree(scopeProperties).children
  }

  ctx.type = 'json'
  ctx.body = Tree.stringifyWithFunctonAndRegExp({ data: itfJSON })
})

/**
 * 更新接口的标签列表
 * @param tagIds
 * @param itf
 */
async function updateInterfaceTags(tagIds: number[], itf: Interface) {
  if (!itf) {
    return
  }

  let newTags = null
  if (tagIds?.length) {
    newTags = await Tag.findAll({
      where: {
        id: {
          [Op.in]: tagIds,
        },
      },
    })
  }
  itf.$set('tags', newTags)

  await itf.save()
}

router.post('/interface/create', isLoggedIn, async (ctx, next) => {
  const creatorId = ctx.session.id
  const body = Object.assign(ctx.request.body, { creatorId })
  body.priority = Date.now()
  let created: Interface | null = null
  if (body.tmplId > 0) {
    const createdId = await RepositoryService.moveInterface(MoveOp.COPY, body.tmplId, body.repositoryId, body.moduleId, body.name)
    const { id, isTmpl, ...updateParams } = body
    // Interface from template, its isTmpl will be set to false
    await Interface.update({ ...updateParams, isTmpl: false }, { where: { id: createdId } })
    created = await Interface.findByPk(createdId)
  } else if (body.sourceId > 0 && body.targetRepoId > 0) {
    const createdId = await RepositoryService.addInterfaceToTarget(
      +body.sourceId,
      body.sourceName,
      body.sourceModuleDesc,
      +body.targetRepoId,
      body.targetModuleName,
      body.targetVersionId
    )
    await Interface.update({ creatorId }, { where: { id: createdId } })
    created = await Interface.findByPk(createdId)
  } else {
    created = await Interface.create(body)
  }

  // 添加tag绑定
  updateInterfaceTags(body.tagIds, created)

  // await initInterface(created)
  ctx.body = {
    data: {
      itf: await Interface.findByPk(created.id),
    },
  }
  return next()
}, async (ctx) => {
  const itf = ctx.body.data
  await Logger.create({
    userId: ctx.session.id,
    type: 'create',
    repositoryId: itf.repositoryId,
    moduleId: itf.moduleId,
    interfaceId: itf.id,
  })
})

router.post('/interface/update', isLoggedIn, async (ctx, next) => {
  const summary = ctx.request.body
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, +summary.id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const itf = await Interface.findByPk(summary.id, {
    include: [QueryInclude.Tag],
  })
  const itfChangeLog: string[] = []
  itf.name !== summary.name && itfChangeLog.push(`[name] \`${itf.name}\` => \`${summary.name}\``)
  itf.url !== summary.url && itfChangeLog.push(`URL \`${itf.url || '[empty url]'}\` => \`${summary.url}\``)
  itf.method !== summary.method && itfChangeLog.push(`METHOD \`${itf.method}\` => \`${summary.method}\``)
  itfChangeLog.length && await RepositoryService.addHistoryLog({
    entityId: itf.id,
    entityType: Consts.ENTITY_TYPE.INTERFACE,
    changeLog: `[Interface] ${itf.name}(${itf.url || '[empty url]'}) [modified] ${itfChangeLog.join(LOG_SEPERATOR)}`,
    userId: ctx.session.id,
    modId: itf.moduleId,
  })

  // 更新tag绑定
  updateInterfaceTags(summary.tagIds, itf)

  await Interface.update(summary, {
    where: { id: summary.id },
  })

  const newItf = await Interface.findByPk(summary.id, {
    include: [QueryInclude.SimpleTag],
  })
  const itfJSON = newItf.toJSON()
  itfJSON.tags?.forEach(tag => {
    delete tag['InterfacesTags']
  })
  if (summary.properties) {
    await RepositoryService.updateProperties(newItf.id, summary.properties, newItf, ctx.session.id)
  }
  ctx.body = {
    data: {
      itf: itfJSON,
    },
  }
  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) { return }
  const itf = ctx.request.body
  await Logger.create({
    userId: ctx.session.id,
    type: 'update',
    repositoryId: itf.repositoryId,
    moduleId: itf.moduleId,
    interfaceId: itf.id,
  })
})

router.post('/interface/move', isLoggedIn, async ctx => {
  const { modId, itfId, op, interfaceName } = ctx.request.body
  const itf = await Interface.findByPk(itfId)
  const repositoryId = ctx.request.body.repositoryId || itf.repositoryId
  if (!(await RepositoryService.canUserMoveInterface(ctx.session.id, itfId, repositoryId, modId))) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  await RepositoryService.moveInterface(op, itfId, repositoryId, modId, interfaceName)

  ctx.body = {
    data: {
      isOk: true,
    },
  }
})

router.get('/interface/remove', async (ctx, next) => {
  const id = +ctx.query.id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, +id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const itf = await Interface.findByPk(id)
  const properties = await Property.findAll({ where: { interfaceId: id } })
  await RepositoryService.addHistoryLog({
    entityId: itf.repositoryId,
    entityType: Consts.ENTITY_TYPE.REPOSITORY,
    changeLog: `[Interface] ${itf.name} (${itf.url}) [deleted],[data is backup]。`,
    userId: ctx.session.id,
    relatedJSONData: JSON.stringify({ 'itf': itf, 'properties': properties }),
    modId: itf.moduleId,
  })
  const result = await Interface.destroy({ where: { id } })
  await Property.destroy({ where: { interfaceId: id } })
  // 删除接口绑定的标签
  await InterfacesTags.destroy({ where: { interfaceId: id } })
  ctx.body = {
    data: result,
  }
  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) { return }
  const id = +ctx.query.id
  const itf = await Interface.findByPk(id, { paranoid: false })
  await Logger.create({
    userId: ctx.session.id,
    type: 'delete',
    repositoryId: itf.repositoryId,
    moduleId: itf.moduleId,
    interfaceId: itf.id,
  })
})

router.get('/__test__', async (ctx) => {
  const itf = await Interface.findByPk(5331)
  itf.name = itf.name + '+'
  await itf.save()
  ctx.body = {
    data: itf.name,
  }
})

router.post('/interface/lock', async (ctx, next) => {
  if (!ctx.session.id) {
    ctx.body = Consts.COMMON_ERROR_RES.NOT_LOGIN
    return
  }

  const { id } = ctx.request.body
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, +id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  let itf = await Interface.findByPk(id, {
    attributes: ['lockerId'],
    include: [
      QueryInclude.Locker,
    ],
  })
  if (itf.lockerId) { // DONE 2.3 BUG 接口可能被不同的人重复锁定。如果已经被锁定，则忽略。
    ctx.body = {
      data: itf.locker,
    }
    return
  }

  await Interface.update({ lockerId: ctx.session.id }, { where: { id } })
  itf = await Interface.findByPk(id, {
    attributes: ['lockerId'],
    include: [
      QueryInclude.Locker,
    ],
  })
  ctx.body = {
    data: itf.locker,
  }
  return next()
})

router.post('/interface/unlock', async (ctx) => {
  if (!ctx.session.id) {
    ctx.body = Consts.COMMON_ERROR_RES.NOT_LOGIN
    return
  }

  const { id } = ctx.request.body
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, +id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const itf = await Interface.findByPk(id, { attributes: ['lockerId'] })
  if (itf.lockerId !== ctx.session.id) { // DONE 2.3 BUG 接口可能被其他人解锁。如果不是同一个用户，则忽略。
    ctx.body = {
      isOk: false,
      errMsg: '您不是锁定该接口的用户，无法对其解除锁定状态。请刷新页面。',
    }
    return
  }
  await Interface.update({
    // tslint:disable-next-line:no-null-keyword
    lockerId: null,
  }, {
    where: { id },
  })

  ctx.body = {
    data: {
      isOk: true,
    },
  }
})

router.post('/interface/sort', async (ctx) => {
  const { ids } = ctx.request.body
  let counter = 1
  for (let index = 0; index < ids.length; index++) {
    await Interface.update({ priority: counter++ }, {
      where: { id: ids[index] },
    })
  }
  ctx.body = {
    data: ids.length,
  }
})

router.get('/property/count', async (ctx) => {
  ctx.body = {
    data: 0,
  }
})

router.get('/property/list', async (ctx) => {
  const where: any = {}
  const { repositoryId, moduleId, interfaceId, name } = ctx.query
  if (repositoryId) { where.repositoryId = repositoryId }
  if (moduleId) { where.moduleId = moduleId }
  if (interfaceId) { where.interfaceId = interfaceId }
  if (name) { where.name = { [Op.like]: `%${name}%` } }
  ctx.body = {
    data: await Property.findAll({ where }),
  }
})

router.get('/property/get', async (ctx) => {
  const id = +ctx.query.id
  ctx.body = {
    data: await Property.findByPk(id, {
      attributes: { exclude: [] },
    }),
  }
})

router.post('/property/create', isLoggedIn, async (ctx) => {
  const creatorId = ctx.session.id
  const body = Object.assign(ctx.request.body, { creatorId })
  const created = await Property.create(body)
  ctx.body = {
    data: await Property.findByPk(created.id, {
      attributes: { exclude: [] },
    }),
  }
})

router.post('/property/update', isLoggedIn, async (ctx) => {
  let properties = ctx.request.body // JSON.parse(ctx.request.body)
  properties = Array.isArray(properties) ? properties : [properties]
  let result = 0
  for (const item of properties) {
    const property = _.pick(item, Object.keys(Property.rawAttributes))
    const affected = await Property.update(property, {
      where: { id: property.id },
    })
    result += affected[0]
  }
  ctx.body = {
    data: result,
  }
})

router.post('/properties/update', isLoggedIn, async (ctx, next) => {
  const itfId = +ctx.query.itf
  let { properties } = ctx.request.body as { properties: Property[]; summary: Interface }
  const { summary } = ctx.request.body as { properties: Property[]; summary: Interface }
  properties = Array.isArray(properties) ? properties : [properties]

  const itf = await Interface.findByPk(itfId)

  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_SET, ctx.session.id, itfId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  if (summary.bodyOption) {
    itf.bodyOption = summary.bodyOption
    await itf.save()
  }

  const result = await RepositoryService.updateProperties(itfId, properties, itf, ctx.session.id)

  ctx.body = {
    data: {
      result,
      properties: itf.properties,
    },
  }
  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) { return }
  const itf = await Interface.findByPk(ctx.query.itf as string, {
    attributes: { exclude: [] },
  })
  await Logger.create({
    userId: ctx.session.id,
    type: 'update',
    repositoryId: itf.repositoryId,
    moduleId: itf.moduleId,
    interfaceId: itf.id,
  })
})

router.get('/property/remove', isLoggedIn, async (ctx) => {
  const { id } = ctx.query
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.PROPERTY_SET, ctx.session.id, +id)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  ctx.body = {
    data: await Property.destroy({
      where: { id },
    }),
  }
})

router.post('/repository/import', isLoggedIn, async (ctx) => {
  const { orgId, projectData, repositoryId, swagger, cover } = ctx.request.body
  let versionId = null
  if (ctx.request.body.versionId) {
    versionId = +ctx.request.body.versionId
  }
  if (orgId && !await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_SET, ctx.session.id, orgId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  // 权限判断
  if (repositoryId && !await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, repositoryId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  let success = false
  let message = ''
  try {
    const data = projectData ? JSON5.parse(projectData).data : swagger
    await MigrateService.importRepoFromJSON({
      data,
      curUserId: ctx.session.id,
      createRepo: !!!repositoryId,
      pkId: repositoryId || orgId,
      cover,
      versionId,
    })
    success = true
  } catch (ex) {
    success = false
    message = ex.message
  }
  ctx.body = {
    isOk: success,
    message: success ? '导入成功' : `导入失败：${message}`,
  }
})

const ImportSwaggerLimit = {
  pathLimit: 20,  // 接口数量限制
  definitionLimit: 10, // Bean类型数量限制
}
router.post('/repository/importswagger', isLoggedIn, async (ctx) => {
  const { orgId, repositoryId, swagger, version = 1, mode = 'manual', cover } = ctx.request.body
  let versionId = null
  if (ctx.request.body.versionId) {
    versionId = +ctx.request.body.versionId
  }
  // 权限判断
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, repositoryId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  const { paths, definitions, components } = swagger

  // 校验接口数量和Bean对象数量
  const outPathLimit = paths && Object.keys(paths).length > ImportSwaggerLimit.pathLimit
  const outDefinitionLimit = definitions && Object.keys(definitions).length > ImportSwaggerLimit.definitionLimit
    || components?.schemas && Object.keys(components.schemas).length > ImportSwaggerLimit.definitionLimit

  if (outPathLimit || outDefinitionLimit) {
    MigrateProcessService.import({
      repositoryId: repositoryId,
      mode: cover === COVER_TYPE.CREATE ? 'add' : 'cover',
      dataType: 'Swagger',
      data: swagger,
      userId: ctx.session.id,
      versionId,
    })
    ctx.body = {
      isOk: true,
      type: 'async',
      message: `Swagger data is oversize. Importing by async method.`,
    }
    return
  }

  const result = await MigrateService.importRepoFromSwaggerDocUrl(orgId, ctx.session.id, swagger, version, mode, repositoryId, cover, versionId)

  ctx.body = {
    isOk: result.code === 'success',
    type: 'sync',
    message: result.code === 'success' ? '导入成功' : '导入失败',
    repository: {
      id: 1,
    },
  }
})

router.post('/repository/importRAP2Backup', isLoggedIn, async (ctx) => {
  const { repositoryId, swagger, modId, cover } = ctx.request.body
  if (!modId) {
    ctx.body = {
      isOk: false,
      message: `请先添加模块`,
    }
    return
  }
  // 权限判断
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, repositoryId)) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }

  try {
    await MigrateService.importInterfaceFromJSON(swagger, ctx.session.id, repositoryId, modId, cover)
    ctx.body = {
      isOk: true,
      message: '导入成功',
      repository: {
        id: 1,
      },
    }
  } catch (ex) {
    ctx.body = {
      isOk: false,
      message: `导入失败: ${ex.message}`,
    }
  }
})

router.post('/repository/importJSON', isLoggedIn, async ctx => {
  const { data } = ctx.request.body

  if (!(await AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, ctx.session.id, data.id))) {
    ctx.body = Consts.COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  try {
    await MigrateService.importRepoFromJSON({
      data,
      curUserId: ctx.session.id,
    })
    ctx.body = {
      isOk: true,
      repository: {
        id: data.id,
      },
    }
  } catch (error) {
    ctx.body = {
      isOk: false,
      message: '服务器错误，导入失败',
    }
    throw (error)
  }


})

router.get('/:type/history/:itfId', isLoggedIn, async ctx => {
  const pager: IPager = {
    limit: +ctx.query.limit || 10,
    offset: +ctx.query.offset || 0,
  }
  let type: ENTITY_TYPE
  if (ctx.params.type === 'interface') {
    type = ENTITY_TYPE.INTERFACE
  } else if (ctx.params.type === 'repository') {
    type = ENTITY_TYPE.REPOSITORY
  } else {
    ctx.body = {
      isOk: false,
      errMsg: 'error path',
    }
    return
  }
  let versionId = null
  if (ctx.query.versionId) {
    versionId = +ctx.query.versionId
  }
  ctx.body = {
    isOk: true,
    data: await RepositoryService.getHistoryLog(+ctx.params.itfId, type, pager, versionId),
  }
})

router.get('/interface/history/JSONData/:id', isLoggedIn, async ctx => {
  const historyLogId = +ctx.params.id
  ctx.set('Content-disposition', `attachment; filename=history_log_detail_data_${historyLogId}`)
  ctx.set('Content-type', 'text/html; charset=UTF-8')
  ctx.body = await RepositoryService.getHistoryLogJSONData(historyLogId)
})

router.get('/interface/backup/JSONData/:id', isLoggedIn, async ctx => {
  const itfId = +ctx.params.id
  ctx.set('Content-disposition', `attachment; filename=interface_backup_${itfId}`)
  ctx.set('Content-type', 'text/html; charset=UTF-8')
  ctx.body = await RepositoryService.getInterfaceJSONData(itfId)
})


