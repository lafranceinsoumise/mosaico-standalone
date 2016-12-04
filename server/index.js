'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const moment = require('moment');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');

var app = express();
const config = require('../config');
const passport = require('./authentication');
const RedisStore = require('connect-redis')(session);

// Static files
app.use('/mosaico', express.static('./mosaico'));
app.use('/templates', express.static('./templates'));
app.use('/uploads', express.static('./uploads'));
app.use('/emails', express.static('./emails'));

// Config
app.enable('trust proxy');
app.set('views', './server/views');
app.set('view engine', 'pug');
app.locals.moment = moment;
app.get('env') === 'development' && app.use(morgan('dev'));
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({
  limit: '5mb',
  extended: true
}));

// Public routes

/**
 * See doc in module
 */
app.get('/img', require('./img'));

// Authentication

app.use(session({
  store: new RedisStore(),
  secret: config.secret,
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/login', (req, res) => {
  res.render('login');
});
app.use('/login', passport.authenticate('local', {successRedirect: '/storage/list', failureRedirect: '/login'}));
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

// Private routes

app.use('/', (req, res, next) => {
  if (!req.user) res.redirect('/login');

  return next();
});

app.get('/', (req, res) => {
  return res.redirect('/storage/list');
});

/**
 * /editor
 * GET load Mosaico
 */
app.get('/mosaico', (req, res) => res.sendFile(path.join(process.cwd(), 'mosaico.html')));
app.get('/new', (req, res) => {
  res.render('editor', {template: req.query.template})
});
app.get('/edit/:id', (req, res) => {
  res.render('editor', {id: req.params.id});
});

/**
 * /upload/
 * GET returns a JSON list of previously uploaded images
 * POST to upload images (using the jQuery-file-upload protocol)
 * when uploading it also create thumbnails for each uploaded image.
 */
app.use('/upload', require('./upload'));

/**
 * POST
 * receives a post with the html body and a parameter asking for "download" or "email".
 * (it does inlining using Styliner) since Mosaico 0.15 CSS inlining happens in the client.
 * if asked to send an email it sends it using nodemailer
 */
app.post('/dl', require('./dl'));

/**
 * See docs in module
 */
app.use('/storage', require('./storage'));

app.listen(process.env.PORT || 3000, '127.0.0.1', (err) => {
  if (err) return console.error(err);

  console.log('Listening on http://localhost:' + (process.env.PORT || 3000));
});
