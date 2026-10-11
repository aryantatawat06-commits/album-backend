const express = require('express')
const mongoose = require('mongoose')
const multer = require('multer')
const uploadfile = require('./services/storage.service')
const postModel = require('./model/post.model')
const collectionModel = require('./model/collection.model')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 20MB per file
})

/* ---------- Collections ---------- */

// create a collection
app.post('/collection', async (req, res) => {
    try {
        const name = (req.body.name || '').trim()

        if (!name) {
            return res.status(400).json({ message: 'Collection name is required' })
        }

        // case-insensitive duplicate check ("Anime" and "anime" are the same)
        const exists = await collectionModel
            .findOne({ name })
            .collation({ locale: 'en', strength: 2 })

        if (exists) {
            return res.status(409).json({ message: 'Collection already exists' })
        }

        const collection = await collectionModel.create({ name })

        res.status(201).json({
            message: 'collection created successfully',
            collection
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'failed to create collection' })
    }
})

// list all collections with post count and a cover image
app.get('/collection', async (req, res) => {
    try {
        const collections = await collectionModel.aggregate([
            {
                $lookup: {
                    from: postModel.collection.name,
                    let: { cid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$collectionId', '$$cid'] } } },
                        { $sort: { createdAt: -1 } },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 },
                                cover: { $first: '$mediaUrl' },
                                coverType: { $first: '$mediaType' }
                            }
                        }
                    ],
                    as: 'stats'
                }
            },
            { $addFields: { stats: { $arrayElemAt: ['$stats', 0] } } },
            {
                $project: {
                    name: 1,
                    createdAt: 1,
                    count: { $ifNull: ['$stats.count', 0] },
                    cover: { $ifNull: ['$stats.cover', null] },
                    coverType: { $ifNull: ['$stats.coverType', null] }
                }
            },
            { $sort: { createdAt: -1 } }
        ])

        res.status(200).json({
            message: 'collections fetched successfully',
            collections
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'failed to fetch collections' })
    }
})

// single collection (for the page heading)
app.get('/collection/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid collection id' })
        }

        const collection = await collectionModel.findById(req.params.id)

        if (!collection) {
            return res.status(404).json({ message: 'Collection not found' })
        }

        res.status(200).json({ collection })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'failed to fetch collection' })
    }
})

/* ---------- Posts ---------- */

app.post('/create-post', (req, res, next) => {
    upload.array('media', 100)(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ message: 'File too large. Max size is 20MB each' })
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({ message: 'You can upload max 50 files at a time' })
            }
            return res.status(400).json({ message: err.message })
        }
        next()
    })
}, async (req, res) => {
    try {
        const files = req.files || []

        // one link -> string, many links -> array, so normalize both
        const links = []
            .concat(req.body.mediaLinks || [])
            .map((l) => l.trim())
            .filter(Boolean)

        if (files.length === 0 && links.length === 0) {
            return res.status(400).json({ message: 'Upload a file or paste a link' })
        }

        // validate the collection first, before anything is uploaded
        const collectionId = req.body.collectionId || undefined
        if (collectionId) {
            if (!mongoose.isValidObjectId(collectionId)) {
                return res.status(400).json({ message: 'Invalid collection id' })
            }
            const found = await collectionModel.exists({ _id: collectionId })
            if (!found) {
                return res.status(404).json({ message: 'Collection not found' })
            }
        }

        // validate every link, nothing is saved if any link is bad
        const linkItems = []
        for (const link of links) {
            let parsed
            try {
                parsed = new URL(link)
            } catch {
                return res.status(400).json({ message: `Invalid link: ${link}` })
            }

            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return res.status(400).json({ message: `Link must start with http or https: ${link}` })
            }

            linkItems.push({
                mediaUrl: link,
                mediaType: /\.(mp4|webm|mov|ogg)$/i.test(parsed.pathname) ? 'video' : 'image'
            })
        }

        // upload all files in parallel
        const fileItems = await Promise.all(
            files.map(async (file) => {
                const result = await uploadfile(file.buffer, file.originalname)
                return {
                    mediaUrl: result.url,
                    mediaType: file.mimetype.startsWith('video') ? 'video' : 'image'
                }
            })
        )

        const docs = [...fileItems, ...linkItems].map((item) => ({
            ...item,
            caption: req.body.caption,
            collectionId
        }))

        const posts = await postModel.insertMany(docs)

        res.status(201).json({
            message: `${posts.length} post(s) created successfully`,
            posts
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'failed to create post' })
    }
})

// all posts, or only one collection's posts with ?collection=<id>
app.get('/post', async (req, res) => {
    try {
        const filter = {}

        if (req.query.collection) {
            if (!mongoose.isValidObjectId(req.query.collection)) {
                return res.status(400).json({ message: 'Invalid collection id' })
            }
            filter.collectionId = req.query.collection
        }

        const posts = await postModel.find(filter).sort({ createdAt: -1 })

        res.status(200).json({
            message: 'posts fetched successfully',
            posts
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({
            message: 'failed to fetch posts'
        })
    }
})

// delete a post
app.delete('/post/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post id' })
        }

        const post = await postModel.findByIdAndDelete(req.params.id)

        if (!post) {
            return res.status(404).json({ message: 'Post not found' })
        }

        res.status(200).json({ message: 'post deleted successfully' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'failed to delete post' })
    }
})

// move a post to a collection (or remove it with an empty collectionId)
app.patch('/post/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { collectionId } = req.body

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid post id' })
        }

        if (collectionId) {
            if (!mongoose.isValidObjectId(collectionId)) {
                return res.status(400).json({ message: 'Invalid collection id' })
            }
            const found = await collectionModel.exists({ _id: collectionId })
            if (!found) {
                return res.status(404).json({ message: 'Collection not found' })
            }
        }

        const post = await postModel.findByIdAndUpdate(
            id,
            { collectionId: collectionId || null },
            { new: true }
        )

        if (!post) {
            return res.status(404).json({ message: 'Post not found' })
        }

        res.status(200).json({ message: 'post updated successfully', post })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'failed to update post' })
    }
})

module.exports = app