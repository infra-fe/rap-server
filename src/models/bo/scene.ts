import { AllowNull, AutoIncrement, BelongsTo, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript'
import { Interface } from '../'

@Table({paranoid: true, freezeTableName: false, timestamps: true, underscored: true, tableName: 'scenes_tab'})
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

  @BelongsTo(() => Interface, 'interfaceId')
    interface: Interface
}
