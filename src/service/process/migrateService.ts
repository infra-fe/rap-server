import { fork } from 'child_process'
import { RepositoryOpenServiceType } from '../openAPI/repository'

const migrateProcess = fork(`${__dirname}/migrateProcess`)

export default class MigrateProcessService {

  /**
   * 导入接口数据
   * @param params
   */
  public static import(params: RepositoryOpenServiceType.ImportParams) {
    console.log('MigrateProcessService-start:', params.repositoryId)
    migrateProcess.send(params)
  }
}
