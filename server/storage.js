'use strict';

const express = require('express');
const fs = require('mz/fs');
const newUuid = require('uuid/v4');
const path = require('path');

var app = express.Router();
var wrap = fn => (...args) => fn(...args).catch(args[2]);

app.post('/save', wrap(async (req, res, next) => {
  var source = req.body.html;

  if (!source) return next(new Error('No content.'));

  var uuid = (req.body.uuid || newUuid());
  await fs.writeFile(`./emails/${uuid}.html`, source);
  await fs.writeFile(`./emails/${uuid}.json`, JSON.stringify({
    metadata: JSON.parse(req.body.metadata),
    content: JSON.parse(req.body.content)
  }));

  res.status(202).json({uuid: uuid});
}));

app.get('/list', wrap(async (req, res, next) => {
  try {
    var urls = (await fs.readdir('./emails'))
      .filter(filename => (filename.endsWith('.json')))
      .map(filename => path.basename(filename, '.json'))
      .map(id => ({
        view: '/emails/' + id + '.html',
        edit: '/editor#edit/' + id,
        id: id
      }));

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
