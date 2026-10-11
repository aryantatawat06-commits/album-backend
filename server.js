const dns = require('dns')
require('dotenv').config()
console.log('CWD:', process.cwd())
console.log('KEY:', process.env.IMAGEKIT_PRIVATE_KEY)
const app = require('./src/app')
const connectDB = require('./src/db/db')

dns.setServers(['8.8.8.8', '8.8.4.4'])

connectDB()


app.listen(3000,()=>{
    console.log('server is running on port 3000')
})  

