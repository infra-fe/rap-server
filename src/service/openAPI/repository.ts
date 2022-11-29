import { Op, WhereOptions } from 'sequelize'
import { Repository } from '../../models'
import MigrateService, { COVER_TYPE, SwaggerData } from '../../service/migrate'
import RepositoryVersionService from '../../service/repositoryVersion'
import InterfaceOpenService from './interface'
import ModuleOpenService from './module'

const ImportModeMap = {
  'Swagger': {
    'add': COVER_TYPE.CREATE,
    'cover': COVER_TYPE.COVER,
    'clean': COVER_TYPE.COVER,
  },
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RepositoryOpenServiceType {
  export interface ListParams {
    start: number
    limit: number
    nameLike?: string
    owners?: string
    organizations?: string
    orderBy?: string
  }

  export interface GetParams {
    withoutModules?: boolean
    withoutInterfaces?: boolean
    versionName?: string
  }
  export interface ImportParams {
    repositoryId: number
    mode: 'add' | 'cover' | 'clean'
    dataType: 'RAP' | 'Swagger' | 'YAPI' | 'PB'
    data: object
    userId?: number
    versionName?: string
    versionId?: number
  }
  export interface DataParams {
    id: number
    format: string
    versionId: number
  }
}

export default class RepositoryOpenService {

  public static async access(accessToken: string, repositoryId?: number) {
    const where: WhereOptions<Repository> = {
      token: accessToken,
    }
    if (repositoryId) {
      where.id = repositoryId
    }

    const result = await Repository.count({ where })

    return result > 0
  }

  public static async list(params: RepositoryOpenServiceType.ListParams) {
    const { start, limit, nameLike, orderBy } = params

    const where = {}
    if (nameLike) {
      // 根据仓库名字模糊查询
      Object.assign(where, {
        name: {
          [Op.like]: `%${nameLike}%`,
        },
      })
    }

    const { count, rows } = await Repository.findAndCountAll({
      attributes: ['id', 'name', 'description', 'updatedAt'],
      where,
      offset: start,
      limit: limit,
      order: [
        ['id', orderBy || 'DESC'],
      ],
    })

    return { total: count, list: rows }
  }

  public static async get(id: number, params?: RepositoryOpenServiceType.GetParams) {
    // 获取单个仓库的基本信息
    const repo = await Repository.findByPk(id, {
      attributes: ['id', 'name', 'description', 'basePath'],
    })
    if (!repo) {
      return null
    }

    // 获取并组装模块和接口的对应关系
    const { withoutModules, withoutInterfaces, versionName } = params || {}
    if (withoutModules === true) {
      // 不需要模块列表
      return repo.toJSON()
    }
    const version = await RepositoryVersionService.findByName(versionName, id)
    // 根据仓库ID获取模块列表
    const modules = await ModuleOpenService.list({ repositoryId: id}, version?.id || null)
    let interfaces = []
    if (withoutInterfaces !== true) {
      interfaces = await InterfaceOpenService.list({ repositoryId: id }, modules.map(m => m.id))
    }

    // 组装模块和接口关系
    // 对接口按照模块ID进行分组
    const interfaceGroupTree = {}
    let groupKey = null
    for (const itf of interfaces) {
      groupKey = `${itf.moduleId}`

      if (!interfaceGroupTree[groupKey]) {
        interfaceGroupTree[groupKey] = []
      }

      interfaceGroupTree[groupKey].push(itf)
    }

    // 给模块添加interfaces属性
    for (const module of modules) {
      groupKey = `${module.id}`

      if (interfaceGroupTree[groupKey]) {
        module.setDataValue('interfaces', interfaceGroupTree[groupKey])
      }
    }
    const result = {
      ...(repo.toJSON()),
      modules: modules,
    }
    return version ? {
      ...result,
      version: {
        id: version.id,
        name: version.versionName,
        isMaster: version.isMaster,
      },
    } : result
  }

  public static async import(params: RepositoryOpenServiceType.ImportParams) {
    const { repositoryId, mode, dataType, data, userId, versionName, versionId } = params

    let result = null
    switch (dataType) {
      case 'Swagger':
        let targetVersionId = null
        if (!versionId && versionName) {
          try {
            const { version } = await RepositoryVersionService.create({ repositoryId, name: versionName })
            targetVersionId = version?.id
          } catch (e) {
            return
          }
        } else {
          // check if the target version is exist
          const targetVersion = await RepositoryVersionService.findByPk(versionId, repositoryId)
          targetVersionId = targetVersion?.id || null
        }
        // eslint-disable-next-line max-len
        result = await MigrateService.importRepoFromSwaggerDocUrl(null, userId, data as SwaggerData, 1, 'manual', repositoryId, ImportModeMap.Swagger[mode], targetVersionId)
        break
      case 'RAP':
      case 'YAPI':
      case 'PB':
      default:
        result = { result: false, code: 'nonsupport' }
        break
    }

    return result
  }
}
