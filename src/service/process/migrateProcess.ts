import RepositoryOpenService, { RepositoryOpenServiceType } from '../openAPI/repository'

import PromiseMessageChannel, {IHandleMessage} from 'promise-message'
type IPayload = RepositoryOpenServiceType.ImportParams

const taskQueue: Array<IHandleMessage<IPayload, {repositoryId: number}>> = []
let isRunning = false

const messageChannel = new PromiseMessageChannel<IPayload, {repositoryId: number}>({
  sendMessage: process.send.bind(process),
  messageHandler: (message) => {
    console.log('migrateProcess-get repositoryId:', message?.payload?.repositoryId)
    if (message.type === 'request') {
      taskQueue.push(message)
      run()
    }
  },
})

/**
 * 执行导入操作
 * @returns
 */
async function run() {
  if (isRunning || taskQueue.length === 0) {
    return
  }
  // 从队列头取出一个导入任务，并标记为开始导入
  const taskParams = taskQueue.shift()
  isRunning = true
  try {
    await RepositoryOpenService.import(taskParams.payload as IPayload)
  } catch (error) {
    console.error('migrateProcess-error:', error)
  } finally {
    taskParams?.sendResponse({
      repositoryId: taskParams.payload.repositoryId,
    })
    // 标记为导入结束，并导入下一个
    isRunning = false
    run()
  }
}

process.on('message', messageChannel.messageHandler)

console.log('process.pid', process.pid)


