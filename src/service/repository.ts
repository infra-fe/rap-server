import { col, fn, Op } from 'sequelize'
import { HistoryLog, Interface, Module, Organization, Property, QueryInclude, RepositoriesMembers, Repository, User } from '../models'
import { MoveOp } from '../models/bo/interface'
import { AccessUtils, ACCESS_TYPE } from '../routes/utils/access'
import { ENTITY_TYPE } from '../routes/utils/const'
import RedisService, { CACHE_KEY } from '../service/redis'
import { IPager } from '../types'
import OrganizationService from './organization'
import RepositoryVersionService from './repositoryVersion'
import { LOG_SEPERATOR, LOG_SUB_SEPERATOR } from '../models/bo/historyLog'
import * as Consts from '../routes/utils/const'
import { Transaction } from 'sequelize'
export default class RepositoryService {
  public static async canUserAccessRepository(
    userId: number,
    repositoryId: number,
    token?: string
  ): Promise<boolean> {
    const repo = await Repository.findByPk(repositoryId)
    if (!repo) { return false }
    if (token && repo.token === token) { return true }
    if (repo.ownerId === userId) { return true }
    const memberExistsNum = await RepositoriesMembers.count({
      where: {
        userId,
        repositoryId,
      },
    })
    if (memberExistsNum > 0) { return true }
    if(repo.visibility === true) {
      return OrganizationService.canUserAccessOrganization(userId, repo.organizationId)
    } else {
      // 私有仓库 不判断团队的公开性 只判断是否是团队成员
      return OrganizationService.isOrganizationMember(userId, repo.organizationId)
    }
  }

  public static async canUserEditRepository(userId: number, repositoryId: number) {
    // 对仓库成员进行检测
    const repoWithMembers = await Repository.findByPk(repositoryId, {
      include: [
        QueryInclude.Members,
      ],
    })

    if (!repoWithMembers) {
      return false
    }

    const { ownerId: repoOwnerId, members: repoMembers, organizationId } = repoWithMembers
    // console.log('canUserEditRepository-repo:', repoOwnerId, repoMembers, organizationId)

    const isRepoOwner = repoOwnerId === userId // 是否为仓库所有者
    const isRepoMember = repoMembers?.some?.(member => member?.id === userId) // 是否为仓库成员
    if (isRepoOwner || isRepoMember) {
      return true
    }

    // 对团队成员进行检测
    const teamWithMembers = organizationId ? await Organization.findByPk(organizationId, {
      include: [
        QueryInclude.Members,
      ],
    }) : null

    if (!teamWithMembers) {
      return false
    }

    const { ownerId: teamOwnerId, members: teamMembers } = teamWithMembers
    // console.log('canUserEditRepository-team:', teamOwnerId, teamMembers)

    const isTeamOwner = teamOwnerId === userId // 是否团队所有者
    const isTeamMember = teamMembers?.some?.(member => member?.id === userId) // 是否为团队成员
    if (isTeamOwner || isTeamMember) {
      return true
    }

    return false
  }

  public static async canUserMoveInterface(
    userId: number,
    itfId: number,
    destRepoId: number,
    destModuleId: number
  ) {
    return (
      AccessUtils.canUserAccess(ACCESS_TYPE.INTERFACE_GET, userId, itfId) &&
      AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, userId, destRepoId) &&
      AccessUtils.canUserAccess(ACCESS_TYPE.MODULE_SET, userId, destModuleId)
    )
  }

  public static async canUserMoveModule(userId: number, modId: number, destRepoId: number) {
    return (
      AccessUtils.canUserAccess(ACCESS_TYPE.MODULE_GET, userId, modId) &&
      AccessUtils.canUserAccess(ACCESS_TYPE.REPOSITORY_SET, userId, destRepoId)
    )
  }

  public static async moveModule(op: MoveOp, modId: number, destRepoId: number, nameSuffix = '副本', destVersionId?: number) {
    const mod = await Module.findByPk(modId)
    const fromRepoId = mod.repositoryId
    if (op === MoveOp.MOVE) {
      mod.repositoryId = destRepoId
      mod.versionId = destVersionId
      await mod.save()
      await Interface.update(
        {
          repositoryId: destRepoId,
        },
        {
          where: {
            moduleId: modId,
          },
        }
      )
      await Property.update(
        {
          repositoryId: destRepoId,
        },
        {
          where: {
            moduleId: modId,
          },
        }
      )
    } else if (op === MoveOp.COPY) {
      const { id, name, ...otherProps } = mod.toJSON() as Module
      const interfaces = await Interface.findAll({
        where: {
          moduleId: modId,
        },
      })
      const newMod = await Module.create({
        name: mod.name + nameSuffix,
        ...otherProps,
        repositoryId: destRepoId,
        versionId: destVersionId,
      })
      const promises = interfaces.map(itf =>
        RepositoryService.moveInterface(MoveOp.COPY, itf.id, destRepoId, newMod.id, itf.name)
      )
      await Promise.all(promises)
    }
    await Promise.all([
      RedisService.delCache(CACHE_KEY.REPOSITORY_GET, fromRepoId),
      RedisService.delCache(CACHE_KEY.REPOSITORY_GET, destRepoId),
    ])
  }

  /**
   * @param op
   * @param itfId
   * @param destRepoId
   * @param destModuleId
   * @param interfaceName will override new name
   * @returns return newly created Interface.id if MoveOp === COPY
   */
  public static async moveInterface(
    op: MoveOp,
    itfId: number,
    destRepoId: number,
    destModuleId: number,
    interfaceName?: string
  ) {
    let returnedVal = 0
    const itf = await Interface.findByPk(itfId)
    const fromRepoId = itf.repositoryId
    if (op === MoveOp.MOVE) {
      itf.moduleId = destModuleId
      itf.repositoryId = destRepoId
      await Property.update(
        {
          moduleId: destModuleId,
          repositoryId: destRepoId,
        },
        {
          where: {
            interfaceId: itf.id,
          },
        }
      )
      await itf.save()
    } else if (op === MoveOp.COPY) {
      const { id, name, ...otherProps } = itf.toJSON() as Interface
      const newItf = await Interface.create({
        name: interfaceName ? interfaceName : name + '副本',
        ...otherProps,
        repositoryId: destRepoId,
        moduleId: destModuleId,
      })

      const properties = await Property.findAll({
        where: {
          interfaceId: itf.id,
        },
        order: [['parentId', 'asc']],
      })
      // 解决parentId丢失的问题
      const idMap: any = {}
      for (const property of properties) {
        const { id, parentId, ...props } = property.toJSON() as Property
        const newParentId = idMap[parentId + ''] ? idMap[parentId + ''] : -1
        const newProperty = await Property.create({
          ...props,
          interfaceId: newItf.id,
          parentId: newParentId,
          repositoryId: destRepoId,
          moduleId: destModuleId,
        })
        idMap[id + ''] = newProperty.id
      }
      returnedVal = newItf.id
    }
    await Promise.all([
      RedisService.delCache(CACHE_KEY.REPOSITORY_GET, fromRepoId),
      RedisService.delCache(CACHE_KEY.REPOSITORY_GET, destRepoId),
    ])
    return returnedVal
  }

  public static async addHistoryLog(log: Partial<HistoryLog> & { modId?: number }) {
    if (log.modId) {
      const mod = await Module.findByPk(log.modId)
      log.versionId = mod.versionId
    }
    await HistoryLog.create(log)
  }

  public static async getHistoryLog(entityId: number, entityType: ENTITY_TYPE.INTERFACE | ENTITY_TYPE.REPOSITORY, pager: IPager, versionId?: number) {
    const { offset, limit } = pager
    const baseCon = { entityType, entityId }
    const isRepo = entityType === ENTITY_TYPE.REPOSITORY
    let relatedInterfaceIds: number[] = []
    if (isRepo) {
      // 根据仓库ID获取模块列表
      const targetVersion = await RepositoryVersionService.findByPk(versionId, entityId)
      if (targetVersion) {
        if (targetVersion.isMaster) {
          Object.assign(baseCon, {
            [Op.or]: [{ versionId: targetVersion.id }, { versionId: null }],
          })
        } else {
          Object.assign(baseCon, {
            versionId: targetVersion.id,
          })
        }
      }
      const modules = await Module.findAll({
        where: {
          repositoryId: entityId,
          versionId: targetVersion?.id || null,
        },
      })
      const modIds = modules?.map(v => v.id) || []
      const interfaces = await Interface.findAll({ attributes: ['id'], where: { repositoryId: entityId, moduleId: { [Op.in]: modIds } } })
      relatedInterfaceIds = interfaces.map(x => x.id)
    }
    return (await HistoryLog.findAndCountAll({
      attributes: ['id', 'changeLog', 'entityId', 'entityType', 'userId', 'createdAt', [fn('isnull', col('relatedJSONData')), 'jsonDataIsNull']],
      where: {
        ...relatedInterfaceIds.length === 0 ? baseCon : {
          [Op.or]: [baseCon, {
            entityType: ENTITY_TYPE.INTERFACE,
            entityId: { [Op.in]: relatedInterfaceIds },
          }],
        },
      },
      include: [{
        attributes: ['id', 'fullname'],
        model: User,
        as: 'user',
      }],
      order: [['id', 'desc']],
      offset,
      limit,
    }))
  }

  public static async getHistoryLogJSONData(id: number) {
    return (await HistoryLog.findByPk(id))?.relatedJSONData
  }

  public static async getInterfaceJSONData(id: number) {
    const itf = await Interface.findByPk(id)
    const properties = await Property.findAll({ where: { interfaceId: id } })
    return JSON.stringify({ 'itf': itf, 'properties': properties })
  }

  public static async updateRepositoryToken(id: number, newToken: string) {
    const [affectedCount] = await Repository.update({ token: newToken }, {
      where: {
        id,
      },
    })

    if (affectedCount <= 0) {
      throw new Error(`[id]{${id}} does not exist.`)
    }
  }
  public static async removeModule(id: number, transaction?: Transaction) {
    const result = await Module.destroy({ where: { id }, transaction })
    await Interface.destroy({ where: { moduleId: id }, transaction })
    await Property.destroy({ where: { moduleId: id }, transaction })
    return result
  }
  public static async updateProperties(itfId: number, properties: Property[], itf: Interface, userId) {
    const itfPropertiesChangeLog: string[] = []
    let needBackup = false
    let changeCount = 0
    // 删除不在更新列表中的属性
    // DONE 2.2 清除幽灵属性：子属性的父属性不存在（原因：前端删除父属性后，没有一并删除后代属性，依然传给了后端）
    // SELECT * FROM properties WHERE parentId!=-1 AND parentId NOT IN (SELECT id FROM properties)
    /* 查找和删除脚本
      SELECT * FROM properties
        WHERE
          deletedAt is NULL AND
          parentId != - 1 AND
          parentId NOT IN (
            SELECT * FROM (
              SELECT id FROM properties WHERE deletedAt IS NULL
            ) as p
          )
    */

    const pLog = (p: Property, title: string) => ` \`${title}\` ${p.scope === 'request' ? '[request]' : '[response]'} [parameter] \`${p.name}\` ${p.description ? '(' + p.description + ')' : ''}`

    const existingProperties = properties.filter((item: any) => !item.memory)
    const existingPropertyIds = existingProperties.map(x => x.id)

    const originalProperties = await Property.findAll({ where: { interfaceId: itfId } })

    const backupJSON = JSON.stringify({ 'itf': itf, 'properties': originalProperties })

    const deletedProperties = originalProperties.filter(x => existingPropertyIds.indexOf(x.id) === -1)

    const deletedPropertyLog: string[] = []
    for (const deletedProperty of deletedProperties) {
      deletedPropertyLog.push(pLog(deletedProperty, ' [deleted] '))
    }
    changeCount += deletedProperties.length
    deletedPropertyLog.length && itfPropertiesChangeLog.push(deletedPropertyLog.join(LOG_SUB_SEPERATOR))

    let result = await Property.destroy({
      where: {
        id: { [Op.notIn]: existingProperties.map((item: any) => item.id) },
        interfaceId: itfId,
      },
    })

    const updatedPropertyLog: string[] = []
    // 更新已存在的属性
    for (const item of existingProperties) {
      const changed: string[] = []
      const o = originalProperties.filter(x => x.id === item.id)[0]
      if (o) {
        if (o.name !== item.name) {
          changed.push(`[name] ${o.name} => ${item.name}`)
        }
        if (o.required !== item.required) {
          changed.push(`[require] ${o.required ? 'true' : 'false'} => ${item.required}`)
        }
        // mock rules 不记入日志
        if (o.type !== item.type) {
          changed.push(`[type] ${o.type} => ${item.type}`)
        }
        changed.length && updatedPropertyLog.push(`${pLog(item, '[updated]')} ${changed.join(' ')}`)
        changeCount += changed.length
      }
      const affected = await Property.update(item, {
        where: { id: item.id },
      })
      result += affected[0]
    }
    updatedPropertyLog.length && itfPropertiesChangeLog.push(updatedPropertyLog.join(LOG_SUB_SEPERATOR))
    // 插入新增加的属性
    const newProperties = properties.filter((item: any) => item.memory)
    const memoryIdsMap: any = {}
    const addedPropertyLog: string[] = []
    for (const item of newProperties) {
      const created = await Property.create(Object.assign({}, item, {
        id: undefined,
        parentId: -1,
        priority: item.priority || Date.now(),
      }))
      addedPropertyLog.push(pLog(item, '[added]'))
      memoryIdsMap[item.id] = created.id
      item.id = created.id
      result += 1
    }
    changeCount += newProperties.length
    addedPropertyLog.length && itfPropertiesChangeLog.push(addedPropertyLog.join(LOG_SUB_SEPERATOR))
    // 同步 parentId
    for (const item of newProperties) {
      const parentId = memoryIdsMap[item.parentId] || item.parentId
      await Property.update({ parentId }, {
        where: { id: item.id },
      })
    }
    itf = await Interface.findByPk(itfId, {
      include: (QueryInclude.RepositoryHierarchy as any).include[0].include,
    })

    if (changeCount >= 5) {
      needBackup = true
    }

    if (itfPropertiesChangeLog.length) {
      await RepositoryService.addHistoryLog({
        entityId: itf.id,
        entityType: Consts.ENTITY_TYPE.INTERFACE,
        changeLog: `[Interface] ${itf.name}(${itf.url}) [parameter] [modified]： ${itfPropertiesChangeLog.join(LOG_SEPERATOR)}${needBackup ? ', [data is backup]。' : ''}`,
        userId: userId,
        ...needBackup ? { relatedJSONData: backupJSON } : {},
        modId: itf.moduleId,
      })
    }
    return result
  }
  public static async addInterfaceToTarget(
    sourceId: number,
    sourceName: string,
    sourceModuleDesc: string,
    targetRepoId: number,
    targetModuleName: string,
    targetVersionId?: number
  ) {
    const versionId = targetVersionId ? +targetVersionId : null
    const targetVersion = await RepositoryVersionService.findByPk(versionId, targetRepoId)

    let targetModule = await Module.findOne({
      where: {
        repositoryId: targetRepoId,
        name: targetModuleName,
        versionId: targetVersion.id,
      },
    })
    if (!targetModule) {
      targetModule = await Module.create({
        repositoryId: targetRepoId,
        description: sourceModuleDesc || '',
        name: targetModuleName,
        versionId: targetVersion.id,
      })
    }
    return await RepositoryService.moveInterface(MoveOp.COPY, sourceId, targetRepoId, targetModule.id, sourceName)
  }
}
