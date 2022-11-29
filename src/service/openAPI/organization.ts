import { Op } from 'sequelize'
import { Organization, QueryInclude } from '../../models'

export namespace OrganizationOpenServiceType {
  export interface ListParams {
    start: number,
    limit: number,
    nameLike?: string,
    owners?: string,
    organizations?: string,
    orderBy?: string,
  }
}

export default class OrganizationOpenService {

  public static async list(params: OrganizationOpenServiceType.ListParams) {
    const { start, limit, nameLike, orderBy } = params

    const where = {}
    if (nameLike) {
      // 根据仓库名字模糊查询
      Object.assign(where, {
        name: {
          [Op.like]: `%${nameLike}%`
        }
      })
    }
    const { count, rows } = await Organization.findAndCountAll({
      attributes: ['id', 'name', 'description', 'ownerId'],
      where,
      offset: start,
      limit: limit,
      include: [
        QueryInclude.OwnerOpen
      ],
      order: [
        ['id', orderBy || 'DESC'],
      ],
    })

    return { total: count, list: rows }
  }

  public static async get(id: number) {
    // 获取单个仓库的基本信息
    const organization = await Organization.findByPk(id, {
      attributes: ['id', 'name', 'description']
    })
    if (!organization) {
      return null
    }
    return organization.toJSON()
  }
}
