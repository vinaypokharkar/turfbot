// Run a .sql file against the direct DB connection. Usage: node scripts/run-sql.js db/schema.sql
import fs from "fs";
import { direct, close } from "../src/db.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/run-sql.js <file.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");
try {
  await direct.query(sql);
  console.log(`applied ${file}`);
} catch (e) {
  console.error(`failed ${file}:`, e.message);
  process.exitCode = 1;
} finally {
  await close();
}
