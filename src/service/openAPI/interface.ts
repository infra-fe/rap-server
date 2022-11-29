import { Op } from 'sequelize'
import { Interface, Property, Repository } from '../../models'
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InterfaceOpenServiceType {
  export interface ListParams {
    start?: number
    limit?: number
    repositoryId?: number
    moduleId?: number
  }
}

export default class InterfaceOpenService {
  public static async list(params: InterfaceOpenServiceType.ListParams, moduleIds: number[]) {
    const { repositoryId } = params

    const where = {}
    if (repositoryId) {
      // 根据仓库名字模糊查询
      Object.assign(where, {
        repositoryId,
        moduleId: { [Op.in]: moduleIds },
      })
    }

    const result = await Interface.findAll({
      attributes: ['id', 'name', 'url', 'method', 'bodyOption', 'description', 'priority', 'status', 'moduleId', 'repositoryId'],
      where,
    })

    return result
  }

  /**
   * 获取一个接口的定义。包括接口基本信息和字段定义
   * @param id
   * @returns
   */
  public static async get(id: number) {
    // 获取单个接口基本信息
    const itf = await Interface.findByPk(id, {
      // openAPI出于安全考虑，提供最小有用字段
      attributes: ['id', 'name', 'url', 'method', 'bodyOption', 'description', 'priority', 'status', 'moduleId', 'repositoryId', 'updatedAt'],
    })
    if (!itf) {
      return null
    }

    // 获取接口对应仓库的basePath
    const repo = await Repository.findByPk(itf.repositoryId, {
      attributes: ['basePath'],
    })

    // 获取接口的字段定义
    const properties = await Property.findAll({
      attributes: ['id', 'scope', 'type', 'pos', 'name', 'rule', 'value', 'description', 'parentId', 'priority', 'required'],
      where: {
        interfaceId: id,
      },
    })

    return {
      ...(itf.toJSON()),
      basePath: repo.basePath,
      properties: properties && properties.map(item => item.toJSON()),
    }
  }
}
