import sqlite3 from "sqlite3";
const db = new sqlite3.Database("./src/database/banco.db", sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error(err); process.exit(1); }
  db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, rows) => {
    if (err) console.error(err);
    else rows.forEach(r => console.log(r.name));
    db.close(() => process.exit(0));
  });
});
