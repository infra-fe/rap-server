import { Op } from 'sequelize'
import { InterfacesTags, Tag } from '../models'
import { Helper } from '../models/util/helper'

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace TagServiceType {
  export interface CreateParams {
    name: string
    level: string
    repositoryId: number
    color?: string
  }
  export interface CreateResult {
    tag: Pick<Tag, 'id' | 'name' | 'level' | 'repositoryId' | 'color'>
    created: boolean
  }

  export interface ListParams {
    repositoryId?: number
    start?: number
    limit?: number
  }
  export interface ListResult {
    total: number
    list: Tag[]
  }

  export interface RemoveParams {
    repositoryId: number
    tagId: number
  }
}

export default class TagService {
  public static async save(params: TagServiceType.CreateParams): Promise<TagServiceType.CreateResult> {
    if (!params?.name) {
      throw new Error('Service error: name is necessary.')
    }

    const [newTag, created] = await Tag.findOrCreate({
      attributes: { exclude: Helper.exclude.generalities },
      where: {
        name: params.name,
        repositoryId: params.repositoryId,
      },
      defaults: params,
    })

    return {
      created,
      tag: newTag,
    }
  }

  public static async list(params: TagServiceType.ListParams): Promise<TagServiceType.ListResult> {
    const { repositoryId, start = 0, limit = 25 } = params

    const where = {}
    if (!repositoryId) {
      Object.assign(where, {
        level: 'system',
      })
    } else {
      Object.assign(where, {
        [Op.or]: [
          { level: 'system' },
          { level: 'repository', repositoryId },
        ],
      })
    }

    const { rows, count } = await Tag.findAndCountAll({
      attributes: ['id', 'name', 'level', 'repositoryId', 'color'],
      where,
      offset: start,
      limit: limit,
      order: [
        ['level', 'ASC'],
        ['id', 'DESC'],
      ],
    })

    return {
      total: count,
      list: rows,
    }
  }

  public static async remove(params: TagServiceType.RemoveParams): Promise< number | null> {
    const {repositoryId, tagId} = params
    const item = await Tag.destroy({
      where: {
        repositoryId,
        id: tagId,
      },
    })
    await InterfacesTags.destroy({
      where: {
        tagId,
      },
    })
    return item
  }
}
