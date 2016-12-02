'use strict';

const express = require('express');
const upload = require('jquery-file-upload-middleware');

const config = require('../config');

var app = express.Router();

var uploadOptions = {
  tmpDir: '.tmp',
  uploadDir: './uploads',
  uploadUrl: '/uploads',
  imageVersions: { thumbnail: { width: 90, height: 90 } },
  ssl: config.ssl
};
app.use('/', upload.fileHandler(uploadOptions));


module.exports = app;
