import { Column, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript"
import { Interface, Tag } from "../"

@Table({ freezeTableName: true, timestamps: true, underscored: true, tableName: 'interfaces_tags_tab' })
export default class InterfacesTags extends Model<InterfacesTags>{
  @ForeignKey(() => Interface)
  @PrimaryKey
  @Column
  interfaceId: number

  @ForeignKey(() => Tag)
  @PrimaryKey
  @Column
  tagId: number
}
