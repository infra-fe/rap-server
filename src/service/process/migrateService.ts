import { RepositoryOpenServiceType } from '../openAPI/repository'
import PromiseMessageChannel from 'promise-message'
import * as cfork from'cfork'
const cluster = require('cluster')
const workQueue: RepositoryOpenServiceType.ImportParams[] = []

let  messageChannel: PromiseMessageChannel

if(cluster.isPrimary) {
  cfork({
    exec: `${__dirname}/migrateProcess`,
    count: 1,
  })
    .on('fork', worker => {
      console.log('MigrateProcessService-fork:', worker.process.pid)
      const migrateProcess = worker.process
      messageChannel = new PromiseMessageChannel({
        sendMessage: migrateProcess.send.bind(migrateProcess),
      })
      migrateProcess.on('message', messageChannel.messageHandler)
      while(workQueue.length) {
        console.log('MigrateProcessService-shift queue:', workQueue[0].repositoryId)
        MigrateProcessService.import(workQueue.shift())
      }
    })
}


export default class MigrateProcessService {

  /**
   * 导入接口数据
   * @param params
   */
  public static import(params: RepositoryOpenServiceType.ImportParams) {
    if(!messageChannel) {
      // to solve the problem of process not ready
      console.log('MigrateProcessService-wait')
      workQueue.push(params)
      return 'wait for migrateProcess start'
    }
    console.log('MigrateProcessService-start:', params.repositoryId)
    return messageChannel.sendRequest(params)
  }
}
