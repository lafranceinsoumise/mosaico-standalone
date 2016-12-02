'use strict';

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const credentials = require('../config').credentials;

passport.use(new LocalStrategy((username, password, done) => {
  if (credentials.username !== username || credentials.password !== password) {
    return done(null, false, {message: 'Incorrect credentials.'});
  }

  return done(null, credentials.username);
}));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

module.exports = passport;
