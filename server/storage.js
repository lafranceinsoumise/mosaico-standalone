'use strict';

const express = require('express');
const fs = require('mz/fs');
const newUuid = require('uuid/v4');

var app = express.Router();
var wrap = fn => (...args) => fn(...args).catch(args[2]);

app.post('/save', wrap(async (req, res, next) => {
  var source = req.body.html;

  if (!source) return next(new Error('No content.'));

  var uuid = (req.body.uuid || newUuid());
  await fs.writeFile(`./emails/${uuid}.html`, source);

  res.status(202).json({uuid: uuid});
}));

app.get('/list', wrap(async (req, res, next) => {
  try {
    var urls = (await fs.readdir('./emails'))
      .filter(name => (name !== '.gitkeep'))
      .map(name => '/emails/' + name);

    var templates = (await fs.readdir('./templates/dist'))
      .map(name => ({name: name, url: `/editor#/templates/dist/${name}/template-${name}.html`}))
      .concat(
        (await fs.readdir('./templates/custom'))
        .filter(name => (name !== '.gitkeep'))
        .map(name => ({name: name, url: `/editor#/templates/custom/${name}/template-${name}.html`}))
      );

    res.render('list', {list: urls, templates: templates});
  } catch (err) {
    return next(err);
  }
}));

module.exports = app;
