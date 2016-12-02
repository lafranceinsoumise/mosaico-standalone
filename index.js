'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const gm = require('gm').subClass({imageMagick: true});
const morgan = require('morgan');
const nodemailer = require('nodemailer');
const path = require('path');
const upload = require('jquery-file-upload-middleware');
const newUuid = require('uuid/v4');

const config = require('./config');
var app = express();
var mailer = nodemailer.createTransport(config.emailTransport);

var uploadOptions = {
  tmpDir: '.tmp',
  uploadDir: './uploads',
  uploadUrl: '/uploads',
  imageVersions: { thumbnail: { width: 90, height: 90 } }
};

// Static files
app.use('/mosaico', express.static('./mosaico'));
app.use('/templates', express.static('./templates'));
app.use('/uploads', express.static('./uploads'));
app.get('/editor', (req, res) => res.sendFile(path.join(__dirname, 'editor.html')));
app.use('/emails', express.static('./emails'));

app.get('env') === 'development' && app.use(morgan('dev'));

app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({
  limit: '5mb',
  extended: true
}));

/**
 * /upload
 * GET returns a JSON list of previously uploaded images
 * POST to upload images (using the jQuery-file-upload protocol)
 * when uploading it also create thumbnails for each uploaded image.
 */
app.use('/upload', upload.fileHandler(uploadOptions));
app.get('/upload/', function(req, res, next) {
  var baseUrl = req.protocol + '://' + req.get('host') + uploadOptions.uploadUrl;
  var files = [];
  var counter = 1;

  var finish = () => {
    if (!--counter) {
      return res.json({
        files: files
      });
    }
  };

  fs.readdir(uploadOptions.uploadDir, (err, list) => {
    if (err) return next(err);

    list.forEach(name => {
      counter++;
      fs.stat(path.join(uploadOptions.uploadDir, name), (err, stats) => {
        if (err) return next(err);

        if (stats.isFile()) {
          var file = {
            name: name,
            url: [baseUrl, name].join('/'),
            size: stats.size
          };
          uploadOptions.imageVersions.keys().forEach(version => {
            fs.access('', fs.constants.F_OK  | fs.constants.R_OK, (err) => {
              if (!err) {
                file.thumbnailUrl = [baseUrl, version, name].join('/');
                files.push[file];
                finish();
              }
            });
          });
          finish();
        }
      });
    });
    finish();
  });
});

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
app.get('/img', (req, res, next) => {
  var [width, height] = req.query.params.split(',');

  if (req.query.method == 'placeholder') {
    var out = gm(width, height, '#707070');
    res.set('Content-Type', 'image/png');
    var x = 0, y = 0;
    var size = 40;
    // stripes
    while (y < height) {
      out = out
        .fill('#808080')
        .drawPolygon([x, y], [x + size, y], [x + size*2, y + size], [x + size*2, y + size*2])
        .drawPolygon([x, y + size], [x + size, y + size*2], [x, y + size*2]);
      x = x + size*2;
      if (x > width) { x = 0; y = y + size*2; }
    }
    // text
    out = out.fill('#B0B0B0').fontSize(20).drawText(0, 0, width + ' x ' + height, 'center');
    out.stream('png').pipe(res);

    return;
  }

  if (req.query.method === 'resize') {
    var ir = gm(req.query.src);
    ir.format((err, format) => {
      if (err) return next(err);

      res.set('Content-Type', 'image/'+format.toLowerCase());
      ir.autoOrient().resize(width == 'null' ? null : width, height == 'null' ? null : height).stream().pipe(res);
    });

    return;
  }

  if (req.query.method === 'cover') {
    var ic = gm(req.query.src);
    ic.format((err,format) => {
      if (err) return next(err);

      res.set('Content-Type', 'image/'+format.toLowerCase());
      ic.autoOrient().resize(width,height+'^').gravity('Center').extent(width, height+'>').stream().pipe(res);
    });

    return;
  }
});

/**
 * POST
 * receives a post with the html body and a parameter asking for "download" or "email".
 * (it does inlining using Styliner) since Mosaico 0.15 CSS inlining happens in the client.
 * if asked to send an email it sends it using nodemailer
 */
app.post('/dl', (req, res, next) => {
  var source = req.body.html;

  if (req.body.action === 'download') {
    res.setHeader('Content-disposition', 'attachment; filename=' + req.body.filename);
    res.setHeader('Content-type', 'text/html');
    res.write(source);
    return res.end();
  }

  if (req.body.action === 'email') {
    var mailOptions = Object.assign({
      to: req.body.rcpt, // list of receivers
      subject: req.body.subject, // Subject line
      html: source // html body
    }, config.emailOptions);

    mailer.sendMail(mailOptions, (err, info) => {
      if (err) return next(err);

      return res.send('OK: '+info.response);
    });
  }
});

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
