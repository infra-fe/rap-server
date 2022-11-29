import { AllowNull, AutoIncrement, BeforeBulkCreate, BeforeBulkDestroy, BeforeBulkUpdate, BeforeCreate, BeforeDestroy, BeforeUpdate, BelongsTo, BelongsToMany, Column, DataType, Default, ForeignKey, HasMany, Model, PrimaryKey, Table } from 'sequelize-typescript'
import { Interface, Module, Organization, RepositoriesCollaborators, User } from '../'
import RedisService, { CACHE_KEY } from '../../service/redis'
import RepositoryVersion from './repositoryVersion'

@Table({ paranoid: true, freezeTableName: false, timestamps: true })
export default class Repository extends Model<Repository> {

  /** hooks */
  @BeforeCreate
  @BeforeUpdate
  @BeforeDestroy
  static async cleanCache(instance: Repository) {
    await RedisService.delCache(CACHE_KEY.REPOSITORY_GET, instance.id)
  }

  @BeforeBulkCreate
  @BeforeBulkUpdate
  @BeforeBulkDestroy
  static async bulkDeleteCache(options: any) {
    const id = options && options.attributes && options.attributes.id
    if (id) {
      await RedisService.delCache(CACHE_KEY.REPOSITORY_GET, id)
    }
  }

  @AutoIncrement
  @PrimaryKey
  @Column
    id: number

  @AllowNull(false)
  @Column(DataType.STRING(256))
    name: string

  @Column(DataType.TEXT)
    description: string

  @Column(DataType.STRING(256))
    logo: string

  @Column(DataType.STRING(32))
    token: string

  @AllowNull(false)
  @Default(true)
  @Column({ comment: 'true:public, false:private' })
    visibility: boolean

  @Column(DataType.STRING(256))
    basePath: string

  @Column(DataType.STRING(128))
    hashValue: string

  @ForeignKey(() => User)
  @Column
    ownerId: number

  @ForeignKey(() => Organization)
  @Column
    organizationId: number

  @ForeignKey(() => User)
  @Column
    creatorId: number

  @ForeignKey(() => User)
  @Column
    lockerId: number

  @BelongsTo(() => User, 'creatorId')
    creator: User

  @BelongsTo(() => User, 'ownerId')
    owner: User

  @BelongsTo(() => Organization, 'organizationId')
    organization: Organization

  @BelongsTo(() => User, 'lockerId')
    locker: User

  @BelongsToMany(() => User, 'repositories_members', 'repositoryId', 'userId')
    members: User[]

  @HasMany(() => Module, 'repositoryId')
    modules: Module[]

  @HasMany(() => Interface, 'repositoryId')
    interfaces: Interface[]

  @HasMany(() => RepositoryVersion, 'repositoryId')
    versions: RepositoryVersion[]

  @BelongsToMany(() => Repository, () => RepositoriesCollaborators, 'repositoryId', 'collaboratorId')
    collaborators: Repository[]

  @BelongsToMany(() => Repository, () => RepositoriesCollaborators, 'collaboratorId')
    repositories: Repository[]

  collaboratorIdstring?: string
  memberIds?: number[]
  collaboratorIds?: number[]

}
