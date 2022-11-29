import { InputData, jsonInputForTargetLanguage, quicktype } from 'quicktype-core'
const QuicktypeLang = 'json-schema'

export async function getJSONSchema(data: unknown) {
  const jsonInput = jsonInputForTargetLanguage(QuicktypeLang)
  jsonInput.addSourceSync({
    name: 'JSONData',
    samples: [JSON.stringify(data)],
  })

  const inputData = new InputData()
  inputData.addInput(jsonInput)

  const { lines: schemaLines } = await quicktype({
    inputData,
    lang: QuicktypeLang
  })

  try {
    const schema = JSON.parse(schemaLines.join('\n'))
    delete schema.$ref
    return schema
  } catch {
    return {}
  }
}
