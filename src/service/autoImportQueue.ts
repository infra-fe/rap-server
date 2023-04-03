import Redis from 'ioredis'
import { Queue, Worker, Job } from 'bullmq'
import config from '../config/index'
import {DATE_CONST, IMPORT_SOURCE} from '../routes/utils/const'
import * as AutoImportService from './autoImport'
import AutoImport from '../models/bo/autoImport'
const connection = new Redis(config.queueRedis)

// Create a new connection in every instance
export  const AutoImportQueue = new Queue('AutoImportQueue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: {age: 3 * DATE_CONST.DAY, count: 5 },
    removeOnFail: {age: 3 * DATE_CONST.DAY, count: 5 },
  },
})

export const AutoImportWorker = new Worker('AutoImportQueue', async (job: Job)=>{
  const task = await AutoImport.findOne({ where: { id: +job.name } })
  if(!task) {
    // if the task is deleted, delete the job, it is the fallback logic
    deleteImportJob(job.name)
    return
  }
  console.log('AutoImportQueue Worker handle job', job.name, task.toJSON())
  if(task.importSource === IMPORT_SOURCE.YAPI) {
    console.log('start handle YAPI')
    await AutoImportService.importYAPIAddHistory(task.toJSON())
  } else if(task.importSource === IMPORT_SOURCE.SWAGGER) {
    console.log('start handle SWAGGER')
    await AutoImportService.autoImportSwaggerAddHistory(task.toJSON())
  }

}, { connection})

// use task id in mysql to be the jobName
export async function addImportJob({jobName, payload, cronExpression}: {jobName: string; payload?: any; cronExpression: string}) {
  // repeatInterval = 10 * 1000
  await AutoImportQueue.add(jobName, payload, {repeat: {pattern: cronExpression}})
}

export async function deleteImportJob(jobName: string) {
  const jobs = AutoImportQueue.getRepeatableJobs()
  const targetJob = (await jobs).find(item=>item.name === jobName)
  if(targetJob) {
    await AutoImportQueue.removeRepeatableByKey(targetJob.key)
  }
}

export function deleteImportJobs(jobNames: string[]) {
  jobNames.forEach(job=>{
    deleteImportJob(job)
  })
}

export async function updateImportJob({jobName, payload, cronExpression}: {jobName: string; payload?: any; cronExpression: string}) {
  await deleteImportJob(jobName)
  await addImportJob({jobName, payload, cronExpression})
}

// to judge if the job is running
export async function getRepeatableJobs() {
  return await AutoImportQueue.getRepeatableJobs()
}

export async function getDelayedJobs() {
  return await AutoImportQueue.getJobs(['delayed'])
}

// job name is the same with repeatable job name
export async function getJobExecuteHistory(jobName: string) {
  const completedJobs = await AutoImportQueue.getJobs(['completed'])
  const failedJobs = await AutoImportQueue.getJobs(['completed'])
  return {
    completedJobs: completedJobs.filter(item=>item.name === jobName),
    failedJobs: failedJobs.filter(item=>item.name === jobName),
  }
}

