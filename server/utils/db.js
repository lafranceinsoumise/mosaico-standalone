import * as sqlite from "sqlite";
import sqlite3 from "sqlite3";

export default (async () => {
  const db = await sqlite.open({
    filename: process.env.DATABASE_PATH || "./database.sqlite",
    driver: sqlite3.Database,
  });

  await db.migrate();

  return db;
})();
