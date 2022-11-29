/*
 * @Author: xia xian
 * @Date: 2022-08-10 14:12:36
 * @LastEditors: xia xian
 * @LastEditTime: 2022-08-26 14:21:20
 * @Description:
 */
import { Op } from 'sequelize'
import { Module, RepositoryVersion } from '../models'
import { MoveOp } from '../models/bo/interface'
import Pagination from '../routes/utils/pagination'
import RepositoryService from './repository'

export interface ListParams {
  start: number
  limit: number
  name: string
  repositoryId: number
}

export interface CreateParams {
  repositoryId: number
  name: string
  target?: string
}

export interface CreateResult {
  success: boolean
  message?: string
  created?: boolean
  version?: RepositoryVersion
}

export interface DeleteParams {
  repositoryId: number
  versionId: number
}

export default class RepositoryVersionService {
  public static async getMainVersion(repositoryId: number): Promise<RepositoryVersion> {
    if (!repositoryId) {
      return null
    }

    const version = await RepositoryVersion.findOne({
      where: {
        repositoryId,
        isMaster: true,
      },
    })

    return version?.toJSON()
  }
  public static async init(repositoryId: number, versionName?: string) {
    const where = { repositoryId: repositoryId, deletedAt: null }
    // 初始化master版本
    let masterVersion = await RepositoryVersion.findOne({
      where: {
        ...where,
        isMaster: true,
      },
    })
    if (!masterVersion) {
      masterVersion = await RepositoryVersion.create({
        versionName: versionName || 'master',
        isMaster: true,
        repositoryId,
      })
      Module.update({ versionId: masterVersion.id }, {
        where: {
          repositoryId,
          versionId: null,
        },
      })
    }
    return masterVersion
  }
  public static async findList(params: ListParams) {
    const { name, repositoryId, limit = 100, start = 1 } = params
    const where = { repositoryId: repositoryId, deletedAt: null }
    if (name) {
      Object.assign(where, {
        versionName: { [Op.like]: `%${name}%` },
      })
    }
    const total = await RepositoryVersion.count({
      where,
    })
    const pagination = new Pagination(total, start, limit)
    const list = await RepositoryVersion.findAll({
      where,
      attributes: { exclude: [] },
      offset: pagination.start,
      limit: pagination.limit,
      order: [['isMaster', 'DESC'], ['updatedAt', 'DESC']],
    })
    return { total, list }
  }
  public static async create(params: CreateParams): Promise<CreateResult> {
    const { name, repositoryId, target } = params
    // 根据版本名查询对应版本
    const version = await RepositoryVersion.findOne({
      where: { versionName: name, repositoryId, deletedAt: null },
    })

    if (version) {
      // 版本存在
      return {
        success: true,
        message: `Version(${name}) has existed`,
        created: false,
        version: version.toJSON(),
      }
    }

    // 版本不存在，进行创建
    const createdVersion: RepositoryVersion = await RepositoryVersion.create({
      versionName: name,
      repositoryId,
    })

    // 获取目标版本信息
    const targetVersion = target ? await RepositoryVersion.findOne({
      where: {
        versionName: target,
        repositoryId,
        deletedAt: null,
      },
    }) : null

    // 根据target进行初始化新版本的模块列表
    if (createdVersion && targetVersion) {
      const modules = await Module.findAll({
        where: {
          repositoryId,
          versionId: targetVersion.id,
        },
      })

      await Promise.all(modules.map(mod => RepositoryService.moveModule(
        MoveOp.COPY, mod.id, repositoryId, '', createdVersion.id
      )))
    }

    return {
      success: true,
      created: true,
      version: createdVersion.toJSON(),
    }
  }
  public static async delete(params: DeleteParams) {
    const { repositoryId, versionId } = params
    const where = { repositoryId, id: versionId }
    const data = await RepositoryVersion.destroy({
      where,
    })
    if (data) {
      const modules = await Module.findAll({
        where: {
          repositoryId,
          versionId,
        },
      })
      await Promise.all(modules.map(mod => RepositoryService.removeModule(mod.id)))
    }
  }
  public static async findByPk(versionId: null | number, repositoryId: number) {
    // 查询不到版本信息时返回主版本
    const masterBranch = await RepositoryVersion.findOne({
      where: {
        repositoryId,
        isMaster: true,
      },
    })
    if (!versionId) {
      return masterBranch?.toJSON() || null
    }
    const result = await RepositoryVersion.findByPk(versionId)
    if (result && !result.deletedAt) {
      return result.toJSON()
    }
    return masterBranch?.toJSON() || null
  }
  public static async findByName(versionName: null | string, repositoryId: number) {
    // 查询不到版本信息时返回主版本
    const masterBranch = await RepositoryVersion.findOne({
      where: {
        repositoryId,
        isMaster: true,
      },
    })
    if (!versionName) {
      return masterBranch?.toJSON() || null
    }
    const result = await RepositoryVersion.findOne({
      where: {
        versionName,
        repositoryId,
      },
    })
    if (result && !result.deletedAt) {
      return result.toJSON()
    }
    return masterBranch?.toJSON() || null
  }
}
