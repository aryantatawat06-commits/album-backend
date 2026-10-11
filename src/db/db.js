
const mongoose = require('mongoose')
const dns = require('dns')

// Force Node to use Google's DNS resolver for SRV lookups
dns.setServers(['8.8.8.8', '8.8.4.4'])

async function connectDB() {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected to DB ')
}

module.exports = connectDB