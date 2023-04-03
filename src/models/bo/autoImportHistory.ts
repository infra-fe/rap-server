import { Column, Model, PrimaryKey, Table, AutoIncrement, DataType } from 'sequelize-typescript'
import {IMPORT_STATUS, IMPORT_TRIGGER_TYPE} from '../../routes/utils/const'
@Table({ freezeTableName: true, timestamps: true, underscored: true, tableName: 'auto_import_history_tab' })
export default class AutoImportHistory extends Model<AutoImportHistory>{
  @PrimaryKey
  @AutoIncrement
  @Column
    id: number

  @Column
    autoImportId: number

  @Column(DataType.STRING(32))
    importStatus: IMPORT_STATUS

  @Column(DataType.STRING(32))
    importTriggerType: IMPORT_TRIGGER_TYPE

  @Column(DataType.TEXT)
    message: string
}
