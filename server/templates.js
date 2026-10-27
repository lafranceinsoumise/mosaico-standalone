import fs from "node:fs";

import { findUser } from "./authentication.js";
import config from "../config.js";

const distTemplates = fs.readdirSync("./templates/dist");

export function templatesFor(username) {
  const custom = findUser(username)?.templates || [];

  return custom
    .map((name) => ({
      name: `${(config.templateNames && config.templateNames[name]) || name}`,
      url: `/templates/custom/${name}/template.html`,
    }))
    .concat(
      distTemplates.map((name) => ({
        name: `${name} (Dist)`,
        url: `/templates/dist/${name}/template.html`,
      })),
    );
}
