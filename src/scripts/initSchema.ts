import sequelize from '../models/sequelize'
import config from '../config'
const inquirer = require('inquirer')
const args = process.argv.slice(2)
const force = args[0] === 'force'
const create = () => {
  console.log('-----开始执行初始化-----')
  sequelize
    .sync({
      force: true,
    })
    .then(() => {
      console.log('成功初始化 DB Schema')
      process.exit(0)
    })
    .catch(e => {
      console.log('初始化 DB Schema 中遇到了错误')
      console.log(e)
      process.exit(0)
    })
}
if (force) {
  create()
} else {
  inquirer
    .prompt([
      {
        type: 'confirm',
        name: 'toCheckDb',
        message: `确认初始化 ${config.db.host}.${config.db.database} 数据库?`,
        default: false,
      },
    ])
    .then((answers) => {
      if (answers.toCheckDb) {
        create()
      }
    })
    .catch((error) => {
      console.log(error)
    })
}

