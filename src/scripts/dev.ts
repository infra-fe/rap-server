import config from '../config'
import app from './app'

const start = () => {
  const execSync = require('child_process').execSync
  const port = config.serve.port
  const url = `http://localhost:${port}` // /api.html
  const open = false
  console.log('----------------------------------------')
  app.listen(port, () => {
    console.log(`rap2-delos is running as ${url}`)
    if (!open) {return}
    try {
      execSync(`osascript openChrome.applescript ${url}`, { cwd: __dirname, stdio: 'ignore' })
    } catch (e) {
      execSync(`open ${url}`)
    }
  })
}

start()
export {}
