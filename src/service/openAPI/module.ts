
import { Module } from '../../models'

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ModuleOpenServiceType {
  export interface ListParams {
    start?: number
    limit?: number
    repositoryId?: number
  }
}

export default class ModuleOpenService {
  public static async list(params: ModuleOpenServiceType.ListParams, versionId?: number | null) {
    const { repositoryId } = params

    const where = {}
    if (repositoryId) {
      // 根据仓库名字模糊查询
      Object.assign(where, {
        repositoryId,
        versionId: versionId || null,
      })
    }
    const result = await Module.findAll({
      attributes: ['id', 'name', 'description', 'priority'],
      where,
    })

    return result
  }
}
