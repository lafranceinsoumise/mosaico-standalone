import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

import { hashPassword } from "../server/authentication.js";

const rl = createInterface({ input: process.stdin, output: process.stderr });
const password = await rl.question("Password: ");
rl.close();

const salt = randomBytes(16);
console.log(
  `scrypt:${salt.toString("base64")}:${hashPassword(password, salt).toString("base64")}`,
);
