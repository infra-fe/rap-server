import { Column, Model, PrimaryKey, Table, AutoIncrement, DataType, BelongsTo } from 'sequelize-typescript'
import { IMPORT_SOURCE, FREQUENCY_TYPE } from '../../routes/utils/const'
import User from './user'
import RepositoryVersion from './repositoryVersion'
@Table({ freezeTableName: true, timestamps: true, underscored: true, tableName: 'auto_import_tab' })
export default class AutoImport extends Model<AutoImport>{
  @PrimaryKey
  @AutoIncrement
  @Column
    id: number

  @Column
    repositoryId: number

  @Column(DataType.STRING(256))
    taskName: string

  @Column(DataType.STRING(32))
    importSource: IMPORT_SOURCE

  @Column(DataType.STRING(32))
    frequency: FREQUENCY_TYPE

  @Column({
    type: DataType.STRING(256),
    allowNull: true,
  })
    importHost: string
  @Column({
    type: DataType.STRING(256),
    allowNull: true,
  })
    importProjectId: string
  @Column({
    type: DataType.STRING(256),
    allowNull: true,
  })
    importToken: string

  @Column(DataType.INTEGER.UNSIGNED)
    versionId: number

  @Column
    creatorId: number

  @BelongsTo(() => User, 'creatorId')
    creator: User

  @BelongsTo(() => RepositoryVersion, 'versionId')
    version: RepositoryVersion
}
