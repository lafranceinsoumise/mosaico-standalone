import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

import config from "../config.js";

passport.use(
  new LocalStrategy((username, password, done) => {
    var user = config.users.filter(
      (u) => u.username == username && u.password == password,
    );
    if (user.length == 0) {
      return done(null, false, { message: "Incorrect credentials." });
    }

    return done(null, user[0].username);
  }),
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

export default passport;
