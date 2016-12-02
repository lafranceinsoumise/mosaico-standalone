'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const path = require('path');

var app = express();
const config = require('../config');
const passport = require('./authentication');

app.set('views', './server/views');
app.set('view engine', 'pug');
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({
  limit: '5mb',
  extended: true
}));

app.use(require('express-session')({ secret: config.secret, resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

app.get('/login', (req, res) => {
  res.render('login');
});
app.use('/login', passport.authenticate('local', {successRedirect: '/storage/list', failureRedirect: '/login'}));
app.use('/', (req, res, next) => {
  if (!req.user) res.redirect('/login');

  return next();
});

// Static files
app.use('/mosaico', express.static('./mosaico'));
app.use('/templates', express.static('./templates'));
app.use('/uploads', express.static('./uploads'));
app.get('/editor', (req, res) => res.sendFile(path.join(process.cwd(), 'editor.html')));
app.use('/emails', express.static('./emails'));

app.get('env') === 'development' && app.use(morgan('dev'));

/**
 * /upload/
 * GET returns a JSON list of previously uploaded images
 * POST to upload images (using the jQuery-file-upload protocol)
 * when uploading it also create thumbnails for each uploaded image.
 */
app.use('/upload/', require('./upload'));

/*
 * GET with src, method and params query values
 * method can be "placeholder", "cover" or "resize"
 * "placeholder" will return a placeholder image with the given width/height
 * (encoded in params as "width,height")
 * "cover" will resize the image keeping the aspect ratio and covering the whole
 * dimension (cutting it if different A/R)
 * "resize" can receive one dimension to resize while keeping the A/R, or 2 to
 * resize the image to be inside the dimensions.
 * this uses "gm" library to do manipulation (you need ImageMagick installed in your system).
 */
app.get('/img', require('./img'));

/**
 * POST
 * receives a post with the html body and a parameter asking for "download" or "email".
 * (it does inlining using Styliner) since Mosaico 0.15 CSS inlining happens in the client.
 * if asked to send an email it sends it using nodemailer
 */
app.post('/dl', require('./dl'));

app.use('/storage', require('./storage'));

app.listen(process.env.PORT || 3000, '127.0.0.1', (err) => {
  if (err) return console.error(err);

  console.log('Listening on http://localhost:' + (process.env.PORT || 3000));
});
