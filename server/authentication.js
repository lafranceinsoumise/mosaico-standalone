'use strict';

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const users = require('../config').users;

passport.use(new LocalStrategy((username, password, done) => {
  var user = users.filter(u => (u.username == username && u.password == password));
  if (user.length == 0) {
    return done(null, false, {message: 'Incorrect credentials.'});
  }

  return done(null, user[0].username);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;
