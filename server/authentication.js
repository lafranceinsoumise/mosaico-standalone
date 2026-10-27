import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

import config from "../config.js";

export function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64);
}

function checkPassword(password, stored) {
  if (typeof stored !== "string") return false;

  if (stored.startsWith("scrypt:")) {
    const [, salt, hash] = stored.split(":");
    const expected = Buffer.from(hash, "base64");
    const actual = hashPassword(password, Buffer.from(salt, "base64"));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  const sha = (s) => createHash("sha256").update(String(s)).digest();
  return timingSafeEqual(sha(password), sha(stored));
}

export const findUser = (username) =>
  config.users.find((u) => u.username === username);

passport.use(
  new LocalStrategy((username, password, done) => {
    const user = findUser(username);
    if (!user || !checkPassword(password, user.password)) {
      return done(null, false, { message: "Incorrect credentials." });
    }

    return done(null, user.username);
  }),
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, findUser(user) ? user : false);
});

export default passport;
