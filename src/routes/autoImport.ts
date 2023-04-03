import router from './router'
import AutoImport from '../models/bo/autoImport'
import AutoImportHistory from '../models/bo/autoImportHistory'

import { isLoggedIn, canUserAccessRepository } from './base'
import * as autoImportQueueService from '../service/autoImportQueue'
import {getCronExpression, IMPORT_TRIGGER_TYPE} from '../routes/utils/const'
import User from '../models/bo/user'
import RepositoryVersion from '../models/bo/repositoryVersion'
import * as AutoImportService from '../service/autoImport'
import { IMPORT_SOURCE } from '../routes/utils/const'

router.get('/autoImport/list', isLoggedIn, async (ctx) => {
  const {repositoryId, limit = 10, offset = 0, versionId = null} = ctx.query

  const {rows, count} = await AutoImport.findAndCountAll({
    where: { repositoryId: +repositoryId, versionId },
    limit: +limit,
    offset: +offset,
    attributes: { exclude: [] },
    order: [['id', 'DESC']],
    include: [User,RepositoryVersion],
  })
  const repeatJobs = await autoImportQueueService.getRepeatableJobs()
  const result = rows.map(task=>{
    const repeatJob = repeatJobs.find(job=>job.name === task.id.toString())
    return {
      ...task.toJSON(),
      isEnabled: !!repeatJob,
    }
  })
  ctx.body = {
    data: {list: result, count},
  }
})

router.post('/autoImport/create', isLoggedIn, canUserAccessRepository,  async (ctx) => {
  const { body } = ctx.request
  body.creatorId = ctx.session.id
  const result = await AutoImportService.verifyImport(body, ctx)
  if(result.isOk === false){
    return
  }
  const task = await AutoImport.create(body)
  await autoImportQueueService.addImportJob({jobName: task.id.toString(), cronExpression: getCronExpression(task.frequency)})
  ctx.body = {
    data: task.id,
  }
})

router.post('/autoImport/update',isLoggedIn, canUserAccessRepository, async (ctx) => {
  const { body } = ctx.request
  const result = await AutoImportService.verifyImport(body, ctx)
  if(result.isOk === false){
    return
  }
  await AutoImport.update(body, {where: {id: body.id}})
  await autoImportQueueService.updateImportJob({jobName: body.id.toString(), cronExpression: getCronExpression(body.frequency)})
  ctx.body = {
    data: body.id,
  }
})

router.post('/autoImport/delete', isLoggedIn, canUserAccessRepository, async (ctx) => {
  const { id } = ctx.request.body
  const task = await AutoImport.findOne({ where: { id } })
  await task.destroy()
  await autoImportQueueService.deleteImportJob(id.toString())
  ctx.body = {
    data: id,
  }
})

router.post('/autoImport/openTask', isLoggedIn, canUserAccessRepository, async (ctx)=>{
  const { id } = ctx.request.body
  const task = await AutoImport.findOne({ where: { id } })
  await autoImportQueueService.updateImportJob({jobName: task.id.toString(), cronExpression: getCronExpression(task.frequency)})
  ctx.body = {
    data: id,
  }

})

router.post('/autoImport/closeTask', isLoggedIn, canUserAccessRepository, async (ctx)=>{
  const { id } = ctx.request.body
  await autoImportQueueService.deleteImportJob(id.toString())
  ctx.body = {
    data: 1,
  }
})

router.post('/autoImport/verify', isLoggedIn, canUserAccessRepository, async (ctx)=>{
  await AutoImportService.verifyImport(ctx.request.body, ctx)
})

router.post('/autoImport/execute', isLoggedIn, canUserAccessRepository, async (ctx)=>{
  const { id } = ctx.request.body
  const task = await AutoImport.findOne({ where: { id } })
  let importPromise
  if(task.importSource === IMPORT_SOURCE.YAPI){
    importPromise  =  AutoImportService.importYAPIAddHistory(task, IMPORT_TRIGGER_TYPE.MANUAL)
  } else if(task.importSource === IMPORT_SOURCE.SWAGGER){
    importPromise  =  AutoImportService.autoImportSwaggerAddHistory(task, IMPORT_TRIGGER_TYPE.MANUAL)
  }

  const timeoutPromise = new Promise((resolve)=>{
    setTimeout(()=>{
      resolve({
        isOk: true,
      })
    },5000)
  })
  ctx.body = await Promise.race([importPromise, timeoutPromise])
})

router.get('/autoImport/history', isLoggedIn, async (ctx)=>{
  const { importId, limit = 10, offset =0 } = ctx.request.query
  const {rows, count} = await AutoImportHistory.findAndCountAll({
    where: {autoImportId: +importId},
    limit: +limit,
    offset: +offset,
    order:[['id', 'DESC']],
  })
  ctx.body = {
    data: {
      list: rows,
      count,
    },
  }
})

router.get('/autoImport/getAllJobs', async (ctx)=>{
  const repeatJobs = await autoImportQueueService.getRepeatableJobs()
  const delayedJobs = await autoImportQueueService.getDelayedJobs()
  ctx.body = {
    repeatJobs,
    delayedJobs,
  }
})


