const mongoose = require('mongoose')

const postSchema = new mongoose.Schema(
    {
        mediaUrl: String,
        mediaType: { type: String, enum: ['image', 'video'] },
        caption: String,
        collectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Collection',
            default: null
        }
    },
    { timestamps: true }
)

const postModel = mongoose.model('post', postSchema)

module.exports = postModel