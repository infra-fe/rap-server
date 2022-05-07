import { Module, Interface, Property } from '../../models'
import { Repository } from '../../models'
import * as locale from '../../locale/local.json'

const genExampleModule = (extra: any, lang: string) => Object.assign({
  name: locale[lang]['exModule'],
  description: locale[lang]['exModule'],
  creatorId: undefined,
  repositoryId: undefined,
}, extra)
const genExampleInterface = (extra: any, lang: string) => Object.assign({
  name: locale[lang]['exInter'],
  url: `/example/${Date.now()}`,
  method: 'GET',
  description: locale[lang]['exInterDesc'],
  creatorId: undefined,
  lockerId: undefined,
  moduleId: undefined,
  repositoryId: undefined,
}, extra)
const genExampleProperty = (extra: any, lang: string) => Object.assign({
  scope: undefined,
  name: 'foo',
  type: 'String',
  rule: '',
  value: '@ctitle',
  description: ({ request: locale[lang]['exReqAttr'], response: locale[lang]['exResAttr'] } as any)[extra.scope],
  parentId: -1,
  creatorId: undefined,
  interfaceId: undefined,
  moduleId: undefined,
  repositoryId: undefined,
}, extra)

// 初始化仓库
const initRepository = async (repository: Repository, lang: string) => {
  const mod = await Module.create(genExampleModule({
    creatorId: repository.creatorId,
    repositoryId: repository.id,
  }, lang))
  await initModule(mod, lang)
}
// 初始化模块
const initModule = async (mod: Module, lang: string) => {
  const itf = await Interface.create(genExampleInterface({
    creatorId: mod.creatorId,
    moduleId: mod.id,
    repositoryId: mod.repositoryId,
  }, lang))
  await initInterface(itf, lang)
}
// 初始化接口
const initInterface = async (itf: Interface, lang: string) => {
  const { creatorId, repositoryId, moduleId } = itf
  const interfaceId = itf.id
  await Property.create(genExampleProperty({
    scope: 'request',
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  // TODO 2.1 完整的 Mock 示例：无法模拟所有 Mock 规则
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'string',
    type: 'String',
    rule: '1-10',
    value: '★',
    description: locale[lang]['exStrAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'number',
    type: 'Number',
    rule: '1-100',
    value: '1',
    description: locale[lang]['exNumAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'boolean',
    type: 'Boolean',
    rule: '1-2',
    value: 'true',
    description: locale[lang]['exBoolAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'regexp',
    type: 'RegExp',
    rule: '',
    value: '/[a-z][A-Z][0-9]/',
    description: locale[lang]['exRegAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'function',
    type: 'Function',
    rule: '',
    value: '() => Math.random()',
    description: locale[lang]['exFunAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  const array = await Property.create(genExampleProperty({
    scope: 'response',
    name: 'array',
    type: 'Array',
    rule: '1-10',
    value: '',
    description: locale[lang]['exArrAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'foo',
    type: 'Number',
    rule: '+1',
    value: 1,
    description: locale[lang]['exArrItemAttr'],
    parentId: array.id,
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'bar',
    type: 'String',
    rule: '1-10',
    value: '★',
    description: locale[lang]['exArrItemAttr'],
    parentId: array.id,
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'items',
    type: 'Array',
    rule: '',
    value: `[1, true, 'hello', /\\w{10}/]`,
    description: locale[lang]['exCusArrItemAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  const object = await Property.create(genExampleProperty({
    scope: 'response',
    name: 'object',
    type: 'Object',
    rule: '',
    value: '',
    description: locale[lang]['exObjAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'foo',
    type: 'Number',
    rule: '+1',
    value: 1,
    description: locale[lang]['exObjAttr'],
    parentId: object.id,
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'bar',
    type: 'String',
    rule: '1-10',
    value: '★',
    description: locale[lang]['exObjAttr'],
    parentId: object.id,
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
  await Property.create(genExampleProperty({
    scope: 'response',
    name: 'placeholder',
    type: 'String',
    rule: '',
    value: '@title',
    description: locale[lang]['exPlaAttr'],
    creatorId,
    repositoryId,
    moduleId,
    interfaceId,
  }, lang))
}

export {
  genExampleModule,
  genExampleInterface,
  initRepository,
  initModule,
  initInterface,
}
