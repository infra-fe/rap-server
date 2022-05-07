import './custom-typings'
import { PoolOptions } from 'sequelize'
import { ISequelizeConfig } from 'sequelize-typescript'
import { RedisOptions } from 'koa-redis'
import { PoolOptions } from 'sequelize'
import { Application } from 'koa'

declare interface RedisAndClusterOptions extends RedisOptions {
  isRedisCluster?: boolean
  nodes?: object[]
  redisOptions?: any
}


declare interface IConfigOptions {
  version: string
  serve: {
    port: number
    path: string // Context Path
  }
  keys: string[]
  session: {
    key: string
  }
  keycenter?: string | boolean
  db: ISequelizeConfig
  redis: any
  mail: SMTPTransport
  mailSender: string
}

declare interface IPager {
  offset: number
  limit: number
  order?: TOrder
  orderBy?: string
  query?: string
}


declare module 'koa' {
  /**
   * See https://www.typescriptlang.org/docs/handbook/declaration-merging.html for
   * more on declaration merging
   */
  interface Application {
    counter: {[key: string]: boolean}
  }
}
