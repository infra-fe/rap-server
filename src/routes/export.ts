import router from './router'
import { COMMON_ERROR_RES } from './utils/const'
// import PostmanService from '../service/export/postman'
import MarkdownService from '../service/export/markdown'
import OpenApiService from '../service/export/openapi'
// import PDFService from '../service/export/pdf'
import * as moment from 'moment'
import { Repository } from '../models/'
import DocxService from '../service/export/docx'
import { AccessUtils, ACCESS_TYPE } from './utils/access'

// router.get('/export/postman', async ctx => {
//   const repoId = +ctx.query.id
//   if (
//     !(await AccessUtils.canUserAccess(
//       ACCESS_TYPE.REPOSITORY_GET,
//       ctx.session.id,
//       repoId
//     ))
//   ) {
//     ctx.body = COMMON_ERROR_RES.ACCESS_DENY
//     return
//   }
//   if (!(repoId > 0)) {
//     ctx.data = COMMON_ERROR_RES.ERROR_PARAMS
//   }
//   const repository = await Repository.findByPk(repoId)
//   ctx.body = await PostmanService.export(repoId)
//   ctx.set(
//     'Content-Disposition',
//     `attachment; filename="RAP-${encodeURI(
//       repository.name
//     )}-${repoId}-${encodeURI('POSTMAN')}-${moment().format('YYYYMMDDHHmmss')}.json"`
//   )
//   ctx.set(
//     'Content-type',
//     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
//   )
// })
router.get('/export/openapi', async ctx => {
  const repoId = +ctx.query.id
  const format = ctx.query.format
  const versionId = ctx.query.versionId ? +ctx.query.versionId : null
  if (
    !(await AccessUtils.canUserAccess(
      ACCESS_TYPE.REPOSITORY_GET,
      ctx.session.id,
      repoId
    ))
  ) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  if (!(repoId > 0)) {
    ctx.data = COMMON_ERROR_RES.ERROR_PARAMS
  }
  const repository = await Repository.findByPk(repoId)
  ctx.body = await OpenApiService.export(repoId, versionId)
  if (format === 'file') {
    ctx.set(
      'Content-Disposition',
      `attachment; filename="RAP-${encodeURI(
        repository.name
      )}-${repoId}-${encodeURI('OPENAPI3')}-${moment().format('YYYYMMDDHHmmss')}.json"`
    )
    ctx.set(
      'Content-type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  }
})
router.get('/export/markdown', async ctx => {
  const repoId = +ctx.query.id
  const versionId = ctx.query.versionId ? +ctx.query.versionId : null
  if (
    !(await AccessUtils.canUserAccess(
      ACCESS_TYPE.REPOSITORY_GET,
      ctx.session.id,
      repoId
    ))
  ) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  if (!(repoId > 0)) {
    ctx.data = COMMON_ERROR_RES.ERROR_PARAMS
  }
  ctx.body = await MarkdownService.export(repoId, ctx.query.origin as string, versionId)
})

router.get('/export/docx', async ctx => {
  const repoId = +ctx.query.id
  const versionId = ctx.query.versionId ? +ctx.query.versionId : null
  if (
    !(await AccessUtils.canUserAccess(
      ACCESS_TYPE.REPOSITORY_GET,
      ctx.session.id,
      repoId
    ))
  ) {
    ctx.body = COMMON_ERROR_RES.ACCESS_DENY
    return
  }
  if (!(repoId > 0)) {
    ctx.data = COMMON_ERROR_RES.ERROR_PARAMS
  }
  const repository = await Repository.findByPk(repoId)
  ctx.body = await DocxService.export(repoId, ctx.query.origin as string, versionId)
  ctx.set(
    'Content-Disposition',
    `attachment; filename="RAP-${encodeURI(
      repository.name
    )}-${repoId}-${encodeURI('接口文档')}-${moment().format('YYYYMMDDHHmmss')}.docx"`
  )
  ctx.set(
    'Content-type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
})

// router.get('/export/pdf', async ctx => {
//   const repoId = +ctx.query.id
//   if (
//     !(await AccessUtils.canUserAccess(
//       ACCESS_TYPE.REPOSITORY,
//       ctx.session.id,
//       repoId
//     ))
//   ) {
//     ctx.body = COMMON_ERROR_RES.ACCESS_DENY
//     return
//   }
//   if (!(repoId > 0)) {
//     ctx.data = COMMON_ERROR_RES.ERROR_PARAMS
//   }
//   const repository = await Repository.findByPk(repoId)
//   ctx.body = await PDFService.export(repoId, ctx.query.origin)
//   ctx.set(
//     'Content-Disposition',
//     `attachment; filename="RAP-${encodeURI(
//       repository.name
//     )}-${repoId}-${encodeURI('接口文档')}.pdf"`
//   )
//   ctx.set(
//     'Content-type',
//     'application/pdf'
//   )
// })
