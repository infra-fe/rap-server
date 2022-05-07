import router from './router'
import { Organization, User, Logger, Repository, Module, Interface, Property } from '../models'
import { QueryInclude } from '../models'
import * as _ from 'lodash'
import Pagination from './utils/pagination'
import OrganizationService from '../service/organization'
import { Op, FindOptions }  from 'sequelize'
import { isLoggedIn } from './base'
import { AccessUtils, ACCESS_TYPE } from './utils/access'
import { COMMON_ERROR_RES } from './utils/const'

router.get('/app/get', async (ctx, next) => {
  const data: any = {}
  const query = ctx.query
  const hooks: any = {
    organization: Organization,
  }
  for (const name in hooks) {
    if (!query[name]) {continue}
    data[name] = await hooks[name].findByPk(query[name], {
      attributes: { exclude: [] },
    })
  }
  ctx.body = {
    data: Object.assign({}, ctx.body && ctx.body.data, data),
  }

  return next()
})

router.get('/organization/count', async (ctx) => {
  ctx.body = {
    data: await Organization.count(),
  }
})

router.get('/organization/list', async (ctx) => {
  const curUserId = ctx.session.id
  const { name } = ctx.query
  const total = await OrganizationService.getAllOrganizationIdListNum(curUserId)
  const pagination = new Pagination(total, ctx.query.cursor || 1, ctx.query.limit || 100)
  const organizationIds = await OrganizationService.getAllOrganizationIdList(curUserId, pagination, name as string)
  const options: FindOptions = {
    where: {
      id: {
        [Op.in]: organizationIds,
      },
    },
    include: [
      QueryInclude.Creator,
      QueryInclude.Owner,
      QueryInclude.Members,
    ],
    order: [['updatedAt', 'desc']],
  }
  const organizations = await Organization.findAll(options)
  ctx.body = {
    data: organizations,
    pagination,
  }
})
router.get('/organization/owned', isLoggedIn, async (ctx) => {
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

  const auth = await User.findByPk(ctx.session.id)
  const options: any = {
    where,
    attributes: { exclude: [] },
    include: [QueryInclude.Creator, QueryInclude.Owner, QueryInclude.Members],
    order: [['updatedAt', 'DESC']],
  }
  const owned = await auth.$get('ownedOrganizations', options)
  ctx.body = {
    data: owned,
    pagination: undefined,
  }
})
router.get('/organization/joined', isLoggedIn, async (ctx) => {
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

  const auth = await User.findByPk(ctx.session.id)
  const options: object = {
    where,
    attributes: { exclude: [] },
    include: [QueryInclude.Creator, QueryInclude.Owner, QueryInclude.Members],
    order: [['updatedAt', 'DESC']],
  }
  const joined = await auth.$get('joinedOrganizations', options)
  // await auth.getOwnedOrganizations()
  // await auth.getJoinedOrganizations()
  ctx.body = {
    data: joined,
    pagination: undefined,
  }
})
router.get('/organization/get', async (ctx) => {
  const organizationId = +ctx.query.id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_GET, ctx.session.id, organizationId)) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const organization = await Organization.findByPk(+ctx.query.id, {
    attributes: { exclude: [] },
    include: [QueryInclude.Creator, QueryInclude.Owner, QueryInclude.Members],
  } as any)
  ctx.body = {
    data: organization,
  }
})
router.post('/organization/create', isLoggedIn, async (ctx) => {
  const creatorId = ctx.session.id
  const body = Object.assign({}, ctx.request.body, { creatorId, ownerId: creatorId })
  const created = await Organization.create(body)
  if (body.memberIds) {
    const members = await User.findAll({ where: { id: body.memberIds } })
    await created.$set('members', members)
  }
  const filled = await Organization.findByPk(created.id, {
    attributes: { exclude: [] },
    include: [QueryInclude.Creator, QueryInclude.Owner, QueryInclude.Members],
  } as any)
  ctx.body = {
    data: filled,
  }
})
router.post('/organization/update', isLoggedIn, async (ctx, next) => {
  const body = Object.assign({}, ctx.request.body)
  const organizationId = +body.id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_SET, ctx.session.id, organizationId)) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  delete body.creatorId
  // DONE 2.2 支持转移团队
  // delete body.ownerId
  const updated = await Organization.update(body, { where: { id: body.id } })
  if (body.memberIds) {
    const reloaded = await Organization.findByPk(body.id)
    const members = await User.findAll({ where: { id: body.memberIds } })
    ctx.prevAssociations = await reloaded.$get('members')
    await reloaded.$set('members', members)
    ctx.nextAssociations = await reloaded.$get('members')
  }
  ctx.body = {
    data: updated[0],
  }
  return next()
}, async (ctx) => {
  const { id } = ctx.request.body
  // 团队改
  await Logger.create({
    userId: ctx.session.id,
    type: 'update',
    organizationId: id,
  })
  // 加入 & 退出
  if (!ctx.prevAssociations || !ctx.nextAssociations) {return}
  const prevIds = ctx.prevAssociations.map((item: any) => item.id)
  const nextIds = ctx.nextAssociations.map((item: any) => item.id)
  const joined: number[] = _.difference(nextIds, prevIds)
  const exited: number[] = _.difference(prevIds, nextIds)
  const creatorId = ctx.session.id
  for (const userId of joined) {
    await Logger.create({ creatorId, userId, type: 'join', organizationId: id })
  }
  for (const userId of exited) {
    await Logger.create({ creatorId, userId, type: 'exit', organizationId: id })
  }
})
router.post('/organization/transfer',  isLoggedIn, async (ctx) => {
  const { id, ownerId } = ctx.request.body
  const organizationId = +id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_SET, ctx.session.id, organizationId)) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const body = { ownerId }
  const result = await Organization.update(body, { where: { id } })
  ctx.body = {
    data: result[0],
  }
})
router.get('/organization/remove', isLoggedIn, async (ctx, next) => {
  const { id } = ctx.query
  const organizationId = +id
  if (!await AccessUtils.canUserAccess(ACCESS_TYPE.ORGANIZATION_SET, ctx.session.id, organizationId)) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  const result = await Organization.destroy({ where: { id } })
  const repositories = await Repository.findAll({
    where: { organizationId: id },
  })
  if (repositories.length) {
    const ids = repositories.map(item => item.id)
    await Repository.destroy({ where: { id: ids } })
    await Module.destroy({ where: { repositoryId: ids } })
    await Interface.destroy({ where: { repositoryId: ids } })
    await Property.destroy({ where: { repositoryId: ids } })
  }
  ctx.body = {
    data: result,
  }
  return next()
}, async (ctx) => {
  if (ctx.body.data === 0) {return}
  const { id } = ctx.query
  await Logger.create({
    userId: ctx.session.id,
    type: 'delete',
    organizationId: +(id as string),
  })
})
