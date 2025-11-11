const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const ExcelJS = require("exceljs");

const app = express();
const path = require("path");
const dbPath = path.join(__dirname, "database.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("❌ Database connection error:", err);
  else console.log("✅ Database connected:", dbPath);
});



// 🧱 SETUP EJS + STATIC
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

// 🧠 SESSION CONFIG
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: false,
  })
);

// 🔒 MIDDLEWARE
function authRequired(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function adminOnly(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).send("Access Denied: Admins Only");
  }
  next();
}

// 🧾 DATABASE INIT
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      type TEXT,
      status TEXT,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT,
      action TEXT,
      timestamp TEXT
    )
  `);

  db.get(`SELECT * FROM users WHERE username = 'admin'`, (err, row) => {
    if (!row) {
      db.run(
        `INSERT INTO users (username, password, role) VALUES ('admin', 'admin', 'admin')`
      );
      console.log("✅ Default admin account created: admin / admin");
    }
  });
});

// 🕒 Function untuk log aktivitas
function addLog(user, action) {
  const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Asia/Makassar" });
  db.run(`INSERT INTO logs (user, action, timestamp) VALUES (?, ?, ?)`, [user, action, timestamp]);
}

// 🔐 LOGIN PAGE
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// 🔑 LOGIN PROCESS
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (err, user) => {
      if (err) return res.send("Database error");
      if (!user) return res.render("login", { error: "Invalid username or password" });

      req.session.user = user;
      addLog(username, "User logged in");
      res.redirect("/");
    }
  );
});

// 🚪 LOGOUT
app.get("/logout", (req, res) => {
  if (req.session.user) addLog(req.session.user.username, "User logged out");
  req.session.destroy(() => res.redirect("/login"));
});

// 🏠 HALAMAN UTAMA
app.get("/", authRequired, (req, res) => {
  const { search } = req.query;
  let sql = `SELECT * FROM issues`;
  const params = [];

  if (search && search.trim() !== "") {
    sql += ` WHERE title LIKE ?`;
    params.push(`%${search.trim()}%`);
  }

  sql += ` ORDER BY id DESC`;

  db.all(sql, params, (err, issues) => {
    if (err) {
      console.error(err);
      return res.send("Database error");
    }
    res.render("index", {
      user: req.session.user,
      issues,
      status: "all",
      type: "all",
      search: search || "",
      totalPages: 1,
      currentPage: 1,
    });
  });
});


// ➕ ADD ISSUE
app.get("/add", authRequired, (req, res) => {
  res.render("add", { user: req.session.user });
});

app.post("/add", authRequired, (req, res) => {
  const { title, description, type, status } = req.body;
  const created_at = new Date().toLocaleString("en-GB", { timeZone: "Asia/Makassar" });
  db.run(
    `INSERT INTO issues (title, description, type, status, created_at) VALUES (?, ?, ?, ?, ?)`,
    [title, description, type, status, created_at],
    (err) => {
      if (err) console.error(err);
      addLog(req.session.user.username, `Added new issue: ${title}`);
      res.redirect("/");
    }
  );
});

// ✏️ EDIT ISSUE
app.get("/edit/:id", authRequired, (req, res) => {
  db.get("SELECT * FROM issues WHERE id = ?", [req.params.id], (err, issue) => {
    if (err || !issue) return res.send("Issue not found");
    res.render("edit", { user: req.session.user, issue });
  });
});

app.post("/edit/:id", authRequired, (req, res) => {
  const { title, description, type, status } = req.body;
  const updated_at = new Date().toLocaleString("en-GB", { timeZone: "Asia/Makassar" });
  db.run(
    `UPDATE issues SET title=?, description=?, type=?, status=?, created_at=? WHERE id=?`,
    [title, description, type, status, updated_at, req.params.id],
    (err) => {
      if (err) console.error(err);
      addLog(req.session.user.username, `Edited issue #${req.params.id}`);
      res.redirect("/");
    }
  );
});

// ❌ DELETE ISSUE
app.get("/delete/:id", authRequired, (req, res) => {
  db.run(`DELETE FROM issues WHERE id = ?`, [req.params.id], (err) => {
    if (err) console.error(err);
    addLog(req.session.user.username, `Deleted issue #${req.params.id}`);
    res.redirect("/");
  });
});

// 👥 MANAGE USERS
app.get("/users", adminOnly, (req, res) => {
  db.all(`SELECT id, username, role FROM users ORDER BY id ASC`, (err, users) => {
    if (err) users = [];
    res.render("users", { users, user: req.session.user });
  });
});

// ➕ ADD USER
app.get("/add_user", adminOnly, (req, res) => {
  db.all(`SELECT id, username, role FROM users ORDER BY id ASC`, (err, users) => {
    if (err) users = [];
    res.render("add_user", { user: req.session.user, users, error: null });
  });
});

app.post("/add_user", adminOnly, (req, res) => {
  const { username, password, role } = req.body;
  db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
    [username, password, role],
    (err) => {
      if (err) {
        // kembalikan daftar user supaya ejs tidak error
        db.all(`SELECT id, username, role FROM users ORDER BY id ASC`, (err2, users) => {
          if (err2) users = [];
          return res.render("add_user", { user: req.session.user, users, error: "Username already exists" });
        });
      } else {
        addLog(req.session.user.username, `Added new user: ${username}`);
        res.redirect("/users");
      }
    }
  );
});

// 📜 VIEW LOGS
app.get("/logs", adminOnly, (req, res) => {
  db.all(`SELECT * FROM logs ORDER BY id DESC`, (err, logs) => {
    if (err) return res.send("Error loading logs");
    res.render("logs", { logs, user: req.session.user });
  });
});

// 📤 EXPORT ISSUES TO EXCEL
app.get("/export", adminOnly, async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Issues");
  sheet.columns = [
    { header: "ID", key: "id", width: 5 },
    { header: "Title", key: "title", width: 25 },
    { header: "Description", key: "description", width: 40 },
    { header: "Type", key: "type", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Created At", key: "created_at", width: 25 },
  ];

  db.all(`SELECT * FROM issues ORDER BY id ASC`, async (err, rows) => {
    if (err) return res.send("Error generating Excel");
    rows.forEach((r) => sheet.addRow(r));
    addLog(req.session.user.username, "Exported issues to Excel");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=issues.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  });
});

// 🚀 START SERVER
const PORT = process.env.WEB_PORT || process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
