import axios from 'axios'
import AutoImport from '../models/bo/autoImport'
import { convertFromYapi } from 'rap-import-utils'
import MigrateService, {COVER_TYPE} from './migrate'
import AutoImportHistory from '../models/bo/autoImportHistory'
import { IMPORT_TRIGGER_TYPE, IMPORT_STATUS, IMPORT_SOURCE } from '../routes/utils/const'
import MigrateProcessService from './process/migrateService'
import  { Transaction } from 'sequelize'
const axiosInstance = axios.create({
  timeout: 10000,
})

export async function verifyImport(body: AutoImport, ctx) {
  let result = {
    isOk: true,
  }
  if(body.importSource === IMPORT_SOURCE.YAPI){
    result = await verifyYAPIConfig(body)
    ctx.body = result
  } else if(body.importSource === IMPORT_SOURCE.SWAGGER){
    result = await verifySwaggerConfig(body)
    ctx.body = result
  }
  return result
}

export function verifyYAPIConfig({importHost, importProjectId, importToken}: {importHost: string; importProjectId: string; importToken: string}) {
  importHost = importHost.replace(/\/$/, '')
  return axiosInstance.get(`${importHost}/api/interface/getCatMenu`, {
    params: {
      project_id: importProjectId,
      token: importToken,
    },
    timeout: 5000,
  }).then(res=>{
    if (res?.data?.errcode === 0) {
      return {
        isOk: true,
        message: 'verify import success',
      }
    } else {
      return {
        isOk: false,
        message: 'verify import failed: ' + res?.data?.errmsg,
      }
    }
  }).catch(e =>{
    console.log(e)
    return {
      isOk: false,
      message: 'verify import failed: ' + e?.message,
    }
  })
}

export function verifySwaggerConfig({importHost}: {importHost: string}) {
  return axiosInstance.get(importHost).then((res)=>{
    if(res?.data?.openapi === '3.0.0' || res?.data?.swagger === '2.0'){
      return {
        isOk: true,
        message: 'verify Swagger Url success',
      }
    } else {
      return {
        isOk: false,
        message: 'verify Swagger Url failed: just support swagger 2.0 or openapi 3.0',
      }
    }
  }).catch(e =>{
    console.log(e)
    return {
      isOk: false,
      message: 'verify Swagger Url failed: ' + e?.message,
    }
  })
}

export async function importYAPIAddHistory(data: AutoImport, importTriggerType = IMPORT_TRIGGER_TYPE.AUTO) {
  const record = await AutoImportHistory.create({
    autoImportId: data.id,
    importStatus: IMPORT_STATUS.PROCESSING,
    importTriggerType,
  })
  try {
    await importYAPI(data)
    record.set('importStatus', IMPORT_STATUS.SUCCESS)
    await record.save()
    return {
      isOk: true,
    }
  } catch (e) {
    console.log(e)
    record.set('importStatus', IMPORT_STATUS.FAIL)
    const message = e?.message || e?.toString()
    record.set('message', message)
    await record.save()
    return {
      isOk: false,
      message,
    }
  }

}

/**
 * reference: https://hellosean1025.github.io/yapi/openapi.html
 */
export async function importYAPI(data: AutoImport) {
  /**
   *
   * 1 获取菜单列表
   * 2 获取接口列表数据 递归都获取全部
   * 3 循环 获取接口数据 并更新到对应的数据库中
   *
   */
  const { importHost, importProjectId, importToken, repositoryId, versionId, creatorId, id } = data
  const host = importHost.replace(/\/$/, '')
  console.log(`[IMPORT:${id}] start`)
  const catMenu = await getYAPICatMenu(host, importProjectId, importToken)
  console.log(`[IMPORT:${id}] getYAPICatMenu ${catMenu.length}`)
  const catMenuMap = new Map()
  catMenu.forEach(item=>{
    catMenuMap.set(item._id, item)
  })
  const interfaceList = await getYAPIInterfaceList(host, importProjectId, importToken)
  console.log(`[IMPORT:${id}] getYAPIInterfaceList ${interfaceList.length}`)
  let interfaceDetailList = []
  let waitingInterfaceList = []
  const BatchImportSize = 10
  const BatchFetchSize = 5

  for(let i = 0; i < interfaceList.length; i++) {
    if(i % BatchFetchSize === 0 && i > 0) {
      await batchGetInterfaceDetail()
    }
    waitingInterfaceList.push(interfaceList[i])
    if(i % BatchImportSize === 0 && i > 0) {
      await batchImportData()
    }
  }
  if(waitingInterfaceList.length > 0) {
    await batchGetInterfaceDetail()
  }
  if(interfaceDetailList.length > 0) {
    await batchImportData()
  }

  async function batchGetInterfaceDetail() {
    console.log(`[IMPORT:${id}] batchGetInterfaceDetail ${waitingInterfaceList.length}`)
    const detailList = await Promise.all(waitingInterfaceList.map(item=>getYAPIInterfaceDetail(host, importToken, item._id)))
    interfaceDetailList = interfaceDetailList.concat(detailList)
    waitingInterfaceList = []
  }


  async function batchImportData() {
    console.log(`[IMPORT:${id}] batchImportData ${interfaceDetailList.length}`)
    const YAPIFormatData = getYAPIFormatData(catMenuMap, interfaceDetailList)
    const rapFormatData = convertFromYapi(YAPIFormatData)
    await MigrateService.importRepoFromJSON({
      data: rapFormatData,
      curUserId: creatorId,
      createRepo: false,
      pkId: repositoryId,
      cover: COVER_TYPE.COVER,
      versionId,
    })
    interfaceDetailList = []
  }

}

function getYAPIFormatData(catMenuMap, interfaceDetailList) {
  const result = new Map()
  interfaceDetailList.forEach(item=>{
    const cat = catMenuMap.get(item.catid)
    if(cat && !result.get(item.catid)) {
      result.set(item.catid, {
        name: cat.name,
        desc: cat.desc,
        list:[],
      })
    }
    const catData = result.get(item.catid)
    catData.list.push(item)
  })
  const resultArray = []
  for(const value of result.values()) {
    resultArray.push(value)
  }
  return  resultArray
}

export async function getYAPICatMenu(host: string, projectId: string, token: string) {
  const res = await axiosInstance.get(`${host}/api/interface/getCatMenu`, {
    params: {
      project_id: projectId,
      token,
    },
  })
  return res.data.data
}

export async function getYAPIInterfaceList(host: string, projectId: string, token: string) {
  let result: any[] = []
  let page = 1
  const limit = 100

  await new Promise((resolve, reject) => {
    function _getInterfaceList() {
      axiosInstance.get(`${host}/api/interface/list`, {
        params: {
          project_id: projectId,
          token,
          page,
          limit,
        },
      }).then(res=>{
        if(res?.data?.data?.list?.length > 0) {
          result = result.concat(res.data.data.list)
          page++
          _getInterfaceList()
        } else {
          resolve(result)
        }
      }).catch(e=>{
        reject(e)
      })
    }
    _getInterfaceList()
  })

  return result

}

export async function getYAPIInterfaceDetail(host: string, token: string, interfaceId: string) {
  const res = await axiosInstance.get(`${host}/api/interface/get`, {
    params: {
      token,
      id: interfaceId,
    },
  })
  return res.data.data
}

export async function deleteImportByVersionId(versionId: number, transaction: Transaction) {
  const list = await AutoImport.findAll({where: { versionId }})
  const idlist = list.map(item=> item.id+'')
  await AutoImport.destroy({where: { versionId }, transaction})
  await AutoImportHistory.destroy({ where: { autoImportId: idlist }, transaction})
  return idlist
}

export async function deleteImportByRepositoryId(repositoryId: number, transaction?: Transaction) {
  const list = await AutoImport.findAll({ where: { repositoryId }})
  const idlist = list.map(item => item.id +'')
  await AutoImport.destroy({ where: { repositoryId }, transaction})
  await AutoImportHistory.destroy({ where: { autoImportId: idlist }, transaction})
  return idlist
}

export async function autoImportSwagger(data: AutoImport) {
  const { importHost, repositoryId, versionId, creatorId } = data
  const swagger = await axiosInstance.get(importHost).then(res=>{
    return res.data
  })

  // await MigrateService.importRepoFromSwaggerDocUrl(null,creatorId,swagger,1,'manual',repositoryId, COVER_TYPE.COVER, versionId)
  const result = await MigrateProcessService.import({
    repositoryId: repositoryId,
    mode: 'cover',
    dataType: 'Swagger',
    data: swagger,
    userId: creatorId,
    versionId,
  })
  console.log('auto import from child process result', result)

}

export async function autoImportSwaggerAddHistory(data: AutoImport, importTriggerType = IMPORT_TRIGGER_TYPE.AUTO) {
  const record = await AutoImportHistory.create({
    autoImportId: data.id,
    importStatus: IMPORT_STATUS.PROCESSING,
    importTriggerType,
  })
  try {
    await autoImportSwagger(data)
    record.set('importStatus', IMPORT_STATUS.SUCCESS)
    await record.save()
    return {
      isOk: true,
    }
  } catch (e) {
    console.log(e)
    record.set('importStatus', IMPORT_STATUS.FAIL)
    const message = e?.message || e?.toString()
    record.set('message', message)
    await record.save()
    return {
      isOk: false,
      message,
    }
  }

}

