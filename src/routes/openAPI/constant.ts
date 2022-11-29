import * as Yup from 'yup'

/**
 * openAPI返回结果的状态码
 */
export const OPEN_API_STATUS_CODE = {
  SUCCESS: 200,
  PARAM_ILLEGAL: 400,
  NO_ACCESS: 401,
  REJECT: 406,
  NO_DATA: 404,
  SEVER_ERROR: 500,
}

export const BASE_TYPE_CHECK_SCHEMA = {
  INT_ID: Yup.number().integer().min(1), // 整数ID。[1,MAX)
  // STRING_ID: Yup.string().min(4), // 字符串ID。最小长度为4
}
