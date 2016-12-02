'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const newUuid = require('uuid/v4');

var app = express();

// Static files
app.use('/mosaico', express.static('./mosaico'));
app.use('/templates', express.static('./templates'));
app.use('/uploads', express.static('./uploads'));
app.get('/editor', (req, res) => res.sendFile(path.join(process.cwd(), 'editor.html')));
app.use('/emails', express.static('./emails'));

app.get('env') === 'development' && app.use(morgan('dev'));

app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({
  limit: '5mb',
  extended: true
}));

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

app.post('/save', (req, res, next) => {
  var source = req.body.html;

  if (!source) return next(new Error('No content.'));

  var uuid = (req.body.uuid || newUuid());
  fs.writeFile(`./emails/${uuid}.html`, source);

  res.status(202).json({uuid: uuid});
});


app.listen(process.env.PORT || 3000, '127.0.0.1', (err) => {
  if (err) return console.error(err);

  console.log('Listening on http://localhost:' + (process.env.PORT || 3000));
});
