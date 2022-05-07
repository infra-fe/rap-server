import RedisService, { CACHE_KEY } from './redis'

const ENV = process.env.NODE_ENV
const Counter = {
  mock: 0,
}

export enum ENVEnum {
  // 开发环境（预留1～4为本地开发环境）
  development = 1,

  // 测试环境（预留5～9为测试环境）
  test = 5,
  // stable = 6,

  // 线上环境（预留10～为线上环境）
  production = 10,
}

export default class CounterService {

  /**
   * 把计数结果同步到redis的间隔
   */
  // private static readonly SAVE_INTERVAL = 10
  public static readonly envCode = ENVEnum[ENV]

  /**
   * 更新mock接口调用次数并异步更新到redis里
   */
  public static async count() {
    Counter.mock++
  }

  /**
   * 获取mock接口调用总次数，如果无值则从redis中获取
   * @returns
   */
  public static async getTotal(): Promise<number> {
    // 1.如果计数器未设置，从redis中恢复
    try {
      const mockNumber = await RedisService.getCache(CACHE_KEY.GLOBAL_STATUS_COUNTER, this.envCode) || '0'
      return parseInt(mockNumber, 10)
    } catch (e) {
      console.error('mock counter init error:', e)
      return 0
    }
  }

  /**
   * 【异步执行】更新mock数量到redis中
   * @returns
   */
  public static asyncSaveMockNum() {
    const mockNum = Counter.mock
    if (!mockNum || mockNum <= 0) {
      return
    }

    RedisService.increaseCache(CACHE_KEY.GLOBAL_STATUS_COUNTER, mockNum, this.envCode)
    Counter.mock = 0
  }
}
