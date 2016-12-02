'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const upload = require('jquery-file-upload-middleware');

var app = express.Router();

var uploadOptions = {
  tmpDir: '.tmp',
  uploadDir: './uploads/',
  uploadUrl: '/uploads/',
  imageVersions: { thumbnail: { width: 90, height: 90 } }
};

app.use('/', upload.fileHandler(uploadOptions));

app.get('/', (req, res, next) => {
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

module.exports = app;
