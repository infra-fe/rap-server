// https://spec.openapis.org/oas/v3.0.3#fixed-fields-0
export interface OpenAPI3Collection {
  openapi: string // required
  info: {
    title: string
    summary?: string
    description?: string
    termsOfService?: string
    contact?: {
      name: string
      url: string
      email: string
    }
    license?: {
      name: string
      identifier: string
      url: string
    }
    version: string
  }
  servers?: ServerObject[]
  tags?: TagObject[]
  paths?: Record<string, PathItemObject>
  components?: {
    schemas?: Record<string, ReferenceObject | SchemaObject>
  }
}
export type Properties = Record<string, ReferenceObject | SchemaObject>
export type Responses = Record<string, ReferenceObject | ResponseObject>
export interface ServerObject {
  url: string
  description?: string
}
export interface HeaderObject {
  // note: this extends ParameterObject, minus "name" & "in"
  type?: string // required
  description?: string
  required?: boolean
  schema: ReferenceObject | SchemaObject
}
export interface TagObject {
  name: string
  description: stirng
  externalDocs?: {
    description: string
    url: string
  }
}
export interface PathItemObject {
  $ref?: string
  summary?: string
  description?: string
  get?: OperationObject
  put?: OperationObject
  post?: OperationObject
  delete?: OperationObject
  options?: OperationObject
  head?: OperationObject
  patch?: OperationObject
  trace?: OperationObject // V3 ONLY
  parameters?: Array<ReferenceObject | ParameterObject>
}


export interface OperationObject {
  description?: string
  tags?: string[] // unused
  summary?: string // unused
  operationId?: string
  parameters?: Array<ReferenceObject | ParameterObject>
  requestBody?: ReferenceObject | RequestBody
  responses?: Record<string, ReferenceObject | ResponseObject> // required
}

export interface ParameterObject {
  name?: string // required
  in?: 'query' | 'header' | 'path' | 'cookie'  // required
  description?: string
  required?: boolean
  deprecated?: boolean
  schema?: ReferenceObject | SchemaObject // required
}

export type ReferenceObject = { $ref: string }

export interface ResponseObject {
  description?: string
  headers?: Record<string, ReferenceObject | HeaderObject>
  links?: Record<string, ReferenceObject | LinkObject> // V3 ONLY
  content?: {
    // V3 ONLY
    [contentType: string]: { schema: ReferenceObject | SchemaObject }
  }
}

export interface RequestBody {
  description?: string
  content?: {
    [contentType: string]: { schema: ReferenceObject | SchemaObject }
  }
}

export interface SchemaObject {
  title?: string // ignored
  description?: string
  required?: string[]
  enum?: string[]
  type?: string // assumed "object" if missing
  items?: ReferenceObject | SchemaObject
  allOf?: SchemaObject
  properties?: Record<string, ReferenceObject | SchemaObject>
  default?: any
  additionalProperties?: boolean | ReferenceObject | SchemaObject
  nullable?: boolean // V3 ONLY
  oneOf?: Array<ReferenceObject | SchemaObject> // V3 ONLY
  anyOf?: Array<ReferenceObject | SchemaObject> // V3 ONLY
  format?: string // V3 ONLY
}
