require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const strategies = require("./strategies/passport-strategies.js");

const nunjucks = require("nunjucks");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
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

app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.set("view engine", "njk");
app.use(express.urlencoded({ extended: false }));

app.use(passport.initialize());
app.use(passport.session());

app.get("/", (req, res) => {
  if (req.user) {
    res.redirect("/dashboard");
  } else {
    res.render("index");
  }
});

const auth = () => (req, res, next) => {
  if (req.user) {
    return next();
  } else {
    res.redirect("/");
  }
};

// Login/Signup Local

app.post("/login", passport.authenticate("local-login", { failureRedirect: "/login" }), auth(), async(req, res) => {
  res.redirect("/dashboard");
});

app.post("/signup", passport.authenticate("local-signup", { failureRedirect: "/signup" }), auth(), async (req, res) => {
  res.redirect("/dashboard");
});

app.post("/logout", async (req, res, next) => {
  req.logout(async function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Login/Signup GitHub

app.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }), auth(), (req, res) => {
  res.redirect("/dashboard");
});

app.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/github" }),
  auth(),
  (req, res) => {
    res.redirect("/");
  }
);

// Dashboard

const padTo2Digits = (num) => {
  return num.toString().padStart(2, "0");
};

app.get("/dashboard", auth(), async (req, res) => {
  if (req.user) {
    res.render("dashboard", {
      user: req.user,
    });
  } else {
    res.redirect("/");
  }
});

app.get("/getNotes", auth(), async (req, res) => {
  if (req.user) {
    const { age, page } = req.query;
    const perPage = 10;

    console.log(page)

    const entries = await knex
      .table("notes")
      .where({ user_id: req.user.id, isArchived: null })
      .limit(perPage)
      .offset(page === "1" ? 0 : (page - 1) * perPage);

    if (age === "1month") {
      let oneMonthsNotes = [];

      for (let note of entries) {
        const dateNote = Date.now() - note.created;
        if (dateNote < 2592000000) {
          oneMonthsNotes.push(note);
        }
      }

      oneMonthsNotes.map((entry) => {
        const date = new Date(Number(entry.created));
        entry.created = `${[padTo2Digits(date.getDate()), padTo2Digits(date.getMonth() + 1), date.getFullYear()].join(
          "/"
        )}`;
      });

      res.json(oneMonthsNotes);
    } else if (age === "3months") {
      let threeMonthsNotes = [];

      for (let note of entries) {
        const dateNote = Date.now() - note.created;
        if (dateNote < 2592000000 * 3) {
          threeMonthsNotes.push(note);
        }
      }

      threeMonthsNotes.map((entry) => {
        const date = new Date(Number(entry.created));
        entry.created = `${[padTo2Digits(date.getDate()), padTo2Digits(date.getMonth() + 1), date.getFullYear()].join(
          "/"
        )}`;
      });

      res.json(threeMonthsNotes);
    } else if (age === "alltime") {
      const allTimeNotes = await knex
        .table("notes")
        .where({ user_id: req.user.id, isArchived: null })
        .limit(perPage)
        .offset(page === "1" ? 0 : (page - 1) * perPage);

      allTimeNotes.map((entry) => {
        const date = new Date(Number(entry.created));
        entry.created = `${[padTo2Digits(date.getDate()), padTo2Digits(date.getMonth() + 1), date.getFullYear()].join(
          "/"
        )}`;
      });

      res.json(allTimeNotes);
    } else if (age === "archive") {
      let archiveNotes = await knex
        .table("notes")
        .where({ isArchived: true, user_id: req.user.id }).limit(perPage).offset(page === "1" ? 0 : (page - 1) * perPage);

      archiveNotes.map((entry) => {
        const date = new Date(Number(entry.created));
        entry.created = `${[padTo2Digits(date.getDate()), padTo2Digits(date.getMonth() + 1), date.getFullYear()].join(
          "/"
        )}`;
      });

      res.json(archiveNotes);
    }
  }
});
app.get("/getNotes:search", auth(), async (req, res) => {
  if (req.user) {
    const search = req.params.search;

    const allNotes = await knex.table("notes").select();

    let notesId = [];

    allNotes.map((entry) => {
      entry.title = entry.title.toLowerCase();

      let searchNote;

      searchNote = entry.title.match(search.toLowerCase(), "g");

      if (searchNote !== null) {
        notesId.push(entry._id);
      }
    });

    let searchNotes = [];

    for (let noteId of notesId) {
      searchNotes.push(await knex.table("notes").where({ _id: noteId }).first());
    }

    res.json(searchNotes);
  }
});
app.post("/dashboard", auth(), async (req, res) => {
  if (req.user) {
    const { title, text } = req.body;

    const idNewNotes = nanoid();

    await knex.table("notes").insert({
      title: title,
      text: text,
      created: Date.now(),
      user_id: req.user.id,
      isArchived: null,
      _id: idNewNotes,
    });

    const newNote = await knex.table("notes").where({ _id: idNewNotes }).first();

    return res.json(newNote);
  }
});

app.get("/getNote:id", auth(), async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    const neededNote = await knex.table("notes").where({ _id: id }).first();

    res.json(neededNote);
  }
});

app.get("/archiveNote:id", auth(), async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    await knex.table("notes").where({ _id: id }).update({ isArchived: true });
    const archiveNote = await knex.table("notes").where({ _id: id }).first();

    return res.json(archiveNote);
  }
});

app.get("/unarchiveNote:id", auth(), async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    await knex.table("notes").where({ _id: id }).update({ isArchived: null });
    const unarchiveNote = await knex.table("notes").where({ _id: id }).first();

    return res.json(unarchiveNote);
  }
});

app.put("/editNote", auth(), async (req, res) => {
  if (req.user) {
    const { title, id, text } = req.body;

    await knex.table("notes").where({ _id: id }).update({
      title: title,
      text: text,
    });

    const editNote = await knex.table("notes").where({ _id: id }).first();

    return res.json(editNote);
  }
});

app.get("/deleteNote:id", auth(), async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    await knex.table("notes").where({ _id: id }).delete();

    res.send("Note deleted");
  }
});

app.get("/deleteAllArchived", async (req, res) => {
  if (req.user) {
    await knex.table("notes").where({ isArchived: true }).delete();

    res.send("Deleted all archive Note");
  }
});

app.get("/downloadNote:id", auth(), async (req, res) => {
  if (req.user) {
    const id = req.params.id;
    try {
      let pdfDoc = new PDFDocument();

      const note = await knex.table("notes").where({ _id: id }).first();

      const title = note.title;
      const text = note.text;

      pdfDoc.pipe(fs.createWriteStream(`./pdfFiles/${title}.pdf`));
      pdfDoc.font("./font/OpenSans-Regular.ttf").text(
        `${title}



      `,
        { align: "center" }
      );
      pdfDoc.font("./font/OpenSans-Regular.ttf").text(`${text}`);
      pdfDoc.end();

      const fileName = `./pdfFiles/${note.title}.pdf`;

      setTimeout(() => {
        if (fs.existsSync(path.join(__dirname, fileName))) {
          res.download(path.join(__dirname, fileName), fileName);

          setTimeout(() => {
            fs.unlink(`./pdfFiles/${title}.pdf`, (err) => {
              if (err) throw err;
            });
          }, 10000);
        }
      }, 3000);
    } catch (err) {
      console.log(err);
    }
  }
});
const port = process.env.PORT | 3000;

app.listen(port, () => {
  console.log(`     location is http://localhost:${port}`);
});
