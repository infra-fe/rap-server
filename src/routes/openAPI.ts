import baseRouter from './router'
import openRouter from './openAPI/'

baseRouter.use('/openAPI', openRouter.routes())
