import sequelize from "../models/sequelize"

sequelize
  .sync({
    alter: true
  })
  .then(() => {
    console.log("成功升级 DB Schema")
    process.exit(0)
  })
  .catch(e => {
    console.log("升级 DB Schema 中遇到了错误")
    console.log(e)
    process.exit(0)
  })
