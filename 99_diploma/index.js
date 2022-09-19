require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const nunjucks = require("nunjucks");
const crypto = require("crypto");
const { nanoid } = require("nanoid");

const app = express();

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
});

nunjucks.configure("views", {
  autoescape: true,
  express: app,
});

app.use(express.json());
app.use(express.static("public"));

const hash = (a) => {
  return crypto.createHash("sha256").update(a).digest("hex");
};

const findUserByUsername = async (username) => {
  const user = await knex.table("users").where({ username: username }).first();
  return user;
};

const findUserBySessionID = async (sessionId) => {
  const session = await knex.table("sessions").select("user_id").where({ session_id: sessionId }).first();

  if (!session) {
    return;
  }

  return await knex.table("users").where({ id: session.user_id }).first();
};

const createSession = async (userId) => {
  const sessionId = nanoid();

  await knex("sessions").insert({
    user_id: userId,
    session_id: sessionId,
  });
  return sessionId;
};

const deleteSession = async (sessionId) => {
  await knex("sessions").where({ session_id: sessionId }).delete();
};

app.use(cookieParser());

const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) {
    return next();
  }

  const user = await findUserBySessionID(req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

app.set("view engine", "njk");

app.get("/", auth(), (req, res) => {
  res.render("index", {
    authError: req.query.authError === "true" ? "Wrong username or password" : req.query.authError,
  });
});

// Login/Signup

app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);
  if (!user || user.password !== hash(password)) {
    return res.redirect("/?authError=true");
  }

  const sessionId = await createSession(user.id);
  res.cookie("sessionId", sessionId).redirect("/dashboard");
});

app.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  const nameToken = await knex.table("users").where({ username: username }).first();

  if (username.length === 0 && password.length === 0) {
    return res.redirect(`/?authError=You didn't provide a username or password`);
  } else if (nameToken === undefined) {
    console.log("Hello new User");
  } else if (username == nameToken.username) {
    return res.redirect(`/?authError=This name is already taken`);
  }

  await knex.table("users").insert({
    username: username,
    password: hash(password),
    id: nanoid(),
  });

  const user = await findUserByUsername(username);

  const sessionId = await createSession(user.id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/dashboard");
});

// Dashboard

app.get("/dashboard", auth(), async (req, res) => {
  res.render("dashboard", {
    user: req.user,
  });
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) {
    res.redirect("/");
  }

  await deleteSession(req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});
const port = process.env.PORT | 3000;

app.listen(port, () => {
  console.log(`     location is http://localhost:${port}`);
});
