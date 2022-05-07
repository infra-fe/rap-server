import { Table, Column, Model, AutoIncrement, PrimaryKey, AllowNull, DataType, Default, BelongsTo, ForeignKey } from 'sequelize-typescript'
import {  Interface } from '../'

@Table({paranoid: true, freezeTableName: false, timestamps: false, underscored: true, tableName: 'scenes_tab'})
export default class Scene extends Model<Scene> {
  @AllowNull(false)
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
    id: number

  @Default(null)
  @Column(DataType.STRING(256))
    sceneKey: string

  @Default(null)
  @Column(DataType.STRING(256))
    sceneName: string

  @Default(null)
  @Column(DataType.JSON)
    sceneData: string

  @ForeignKey(() => Interface)
  @Column
    interfaceId: number

  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
    createdAt: number

  @AllowNull(false)
  @Column(DataType.INTEGER.UNSIGNED)
    updatedAt: number

  @Column(DataType.INTEGER.UNSIGNED)
    deletedAt: number

  @BelongsTo(() => Interface, 'interfaceId')
    interface: Interface
}
