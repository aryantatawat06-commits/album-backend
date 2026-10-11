const ImageKit = require('imagekit')

const imagekit = new ImageKit({
    publicKey: "your_public_key",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: "your_url_endpoint"
})

async function uploadfile(buffer, fileName) {
    const result = await imagekit.upload({
        file: buffer,
        fileName: fileName || `upload-${Date.now()}`
    })
    return result
}

module.exports = uploadfile