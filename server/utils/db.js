import * as sqlite from "sqlite";
import sqlite3 from "sqlite3";

export default (async () => {
  // open the database
  const db = await sqlite.open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });

  await db.migrate();

  return db;
})();
