import RepositoryOpenService, { RepositoryOpenServiceType } from "../openAPI/repository"

const taskQueue: RepositoryOpenServiceType.ImportParams[] = []
let isRunning = false

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
    await RepositoryOpenService.import(taskParams)
  } catch (error) {
    console.error('migrateProcess-error:', error)
  } finally {
    // 标记为导入结束，并导入下一个
    isRunning = false
    run()
  }
}

process.on('message', (taskParams: RepositoryOpenServiceType.ImportParams) => {
  console.log('migrateProcess-start:', taskParams.repositoryId)
  taskQueue.push(taskParams)
  run()
})
