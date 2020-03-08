const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator');
var ObjectId = require('mongoose').Types.ObjectId;

const io = require('../socket');
const Post = require('../models/post.js');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
    console.log(req.query);
    const currentPage = req.query.page || 1;
    const perPage = 2;
    let totalItems;
    let posts

    if (req.query.userpost) {
        try {
            totalItems = await Post.find().countDocuments()
            posts = await Post.find()
                .populate('creator')
                .sort({ createdAt: -1 })
                // .skip((currentPage - 1) * perPage)
                // .limit(perPage);
    
            res.status(200).json({
                message: 'Fetched posts successfully.',
                posts: posts,
                totalItems: totalItems
            });
        } catch (err) {
            if (!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
            }
        } else {

            try {
                totalItems = await Post.find().countDocuments()
                posts = await Post.find()
                    .populate('creator')
                    .sort({ createdAt: -1 })
                    .skip((currentPage - 1) * perPage)
                    .limit(perPage);
        
                res.status(200).json({
                    message: 'Fetched posts successfully.',
                    posts: posts,
                    totalItems: totalItems
                });
            } catch (err) {
                if (!err.statusCode) {
                    err.statusCode = 500;
                }
                next(err);
            }
        }

    // if (req.query.userId) {
    //     try {
    //         totalItems = await Post.find().countDocuments()
    //         posts = await Post.find()
    //             .populate('creator')
    //             .sort({ createdAt: -1 })
    //             .skip((currentPage - 1) * perPage)
    //             // .limit(perPage);
    
    //         res.status(200).json({
    //             message: 'Fetched posts successfully.',
    //             posts: posts,
    //             totalItems: totalItems
    //         });
    //     } catch (err) {
    //         if (!err.statusCode) {
    //             err.statusCode = 500;
    //         }
    //         next(err);
    //         }
    //     }

}

exports.createPost = async (req, res, next) => {
    // console.log('req.body',req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data incorrect.');
        error.statusCode = 422;
        throw error;
    }
    if (!req.file) {
        const error = new Error('No image provided');
        error.statusCode = 422;
        throw error;
    }
    const imageUrl = req.file.path;
    const title = req.body.title;
    const content = req.body.content;
    const b64Simage = req.body.b64Simage;
    let creator;
    // create post in db
    const post = new Post({
        title: title,
        content: content,
        imageUrl: imageUrl,
        creator: req.userId,
        b64Simage: b64Simage,
    });
    try {
        await post.save()
        const user = await User.findById(req.userId);
        user.posts.push(post);
        await user.save()
        io.getIO().emit('posts', {
             action: 'create', 
             post: {...post._doc, creator: { _id: req.userId, name: user.name } } 
        });
        res.status(201).json({
            message: 'Post created Successfully',
            post: post,
            creator: { _id: user._id, name: user.name }
        })
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    };
}

exports.getPost = async (req, res, next) => {
    const postId = req.params.postId;
    const post = await Post.findById(postId)
    try {
        if (!post) {
            const error = new Error('Could not find post.');
            error.statusCode = 404;
            throw error;
        }
        res.status(200).json({ message: 'Post fetched.', post: post });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.updatePost = async (req, res, next) => {
    // console.log(req);
    const postId = req.params.postId;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data incorrect.');
        error.statusCode = 422;
        throw error;
    }
    const title = req.body.title;
    const content = req.body.content;
    let imageUrl = req.body.image;
    const b64Simage = req.body.b64Simage;
    if (req.file) {
        imageUrl = req.file.path;
    }
    if (!imageUrl) {
        const error = new Error('No file picked.');
        error.statusCode = 422;
        throw error;
    }
    try {

        const post = await Post.findById(postId).populate('creator');

        if (!post) {
            const error = new Error('Could not find post.');
            error.statusCode = 404;
            throw error;
        }
        if (post.creator._id.toString() !== req.userId) {
            const error = new Error('not authorized!');
            error.statusCode = 403;
            throw error;
        }
        if (imageUrl !== post.imageUrl) {
            clearImage(post.imageUrl);
        }
        post.title = title;
        post.imageUrl = imageUrl;
        post.content = content;
        post.b64Simage = b64Simage;

        const result = await post.save();
        io.getIO().emit('posts', { action: 'update', post: result });
        res.status(200).json({ message: 'Post updated', post: result });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.deletePost = async (req, res, next) => {
    const postId = req.params.postId;

    try {
        const post = await Post.findById(postId)

        // check login user
        if (!post) {
            const error = new Error('Could not find post.');
            error.statusCode = 404;
            throw error;
        }
        if (post.creator.toString() !== req.userId) {
            const error = new Error('not authorized!');
            error.statusCode = 403;
            throw error;
        }
        clearImage(post.imageUrl);
        await Post.findByIdAndRemove(postId);

        const user = await User.findById(req.userId);

        user.posts.pull(postId);
        await user.save();
        io.getIO().emit('posts', { action: 'delete', post: postId });

        res.status(200).json({ message: 'Deleted post.' });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

const clearImage = filePath => {
    filePath = path.join(__dirname, '..', filePath);
    fs.unlink(filePath, err => console.log(err));
}
