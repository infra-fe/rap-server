import { AllowNull, AutoIncrement, BelongsToMany, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import { Interface, InterfacesTags, Repository } from "../";

@Table({ paranoid: true, freezeTableName: false, timestamps: true, underscored: true, tableName: 'tags_tab' })
export default class Tag extends Model<Tag> {
  @AllowNull(false)
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER.UNSIGNED)
  id: number

  @AllowNull(false)
  @Column(DataType.STRING(64))
  name: string

  @Default(null)
  @Column(DataType.STRING(32))
  level: string

  @Default(null)
  @ForeignKey(() => Repository)
  @Column
  repositoryId: number

  @Default(null)
  @Column(DataType.STRING(32))
  color: string

  @BelongsToMany(() => Tag, () => InterfacesTags)
  interfaces: Interface[]
}
