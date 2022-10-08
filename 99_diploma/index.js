require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const strategies = require("./strategies/passport-strategies.js");

const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

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
    res.sendStatus(404);
  }
};

// Login/Signup Local

app.post("/login", passport.authenticate("local-login", { failureRedirect: "/login" }), (req, res) => {
  res.redirect("/dashboard");
});

app.post("/signup", passport.authenticate("local-signup", { failureRedirect: "/signup" }), async (req, res) => {
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

app.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }), (req, res) => {
  res.redirect("/dashboard");
});

app.get("/auth/github/callback", passport.authenticate("github", { failureRedirect: "/github" }), (req, res) => {
  res.redirect("/");
});

// Dashboard

function padTo2Digits(num) {
  return num.toString().padStart(2, "0");
}

function formatDate(date) {
  return [padTo2Digits(date.getDate()), padTo2Digits(date.getMonth() + 1), date.getFullYear()].join("/");
}

app.get("/dashboard", async (req, res) => {
  if (req.user) {
    res.render("dashboard", {
      user: req.user,
    });
  } else {
    res.redirect("/");
  }
});

app.get("/getNotes", async (req, res) => {
  if (req.user) {
    const { age, page } = req.query;

    const onArciveNotes = await knex.table("notes").where({ user_id: req.user.id, isArchived: null });

    let dateNotesAndId = [];

    const date = new Date();

    onArciveNotes.map((entry) => {
      const objDateAndId = {};
      objDateAndId.date = Number(entry.created.slice(0, 2));
      objDateAndId.month = Number(entry.created.slice(3, 5));
      objDateAndId.year = Number(entry.created.slice(6));
      objDateAndId.id = entry._id;

      dateNotesAndId.push(objDateAndId);
    });

    if (age === "1month") {
      let oneMonthsNotes = [];

      for (let data of dateNotesAndId) {
        if (
          (data.date <= Number(padTo2Digits(date.getDate())) &&
            data.month === Number(padTo2Digits(date.getMonth() + 1)) &&
            data.year === Number(padTo2Digits(date.getFullYear()))) ||
          (data.month + 1 === Number(padTo2Digits(date.getMonth() + 1)) &&
            data.data >= Number(padTo2Digits(date.getDate())) &&
            data.year === padTo2Digits(date.getFullYear())) ||
          (data.date >= Number(padTo2Digits(date.getDate())) &&
            data.month === 12 &&
            data.year + 1 === padTo2Digits(date.getFullYear()))
        ) {
          oneMonthsNotes.push(await knex.table("notes").where({ _id: data.id, isArchived: null }).first());
        }
      }

      res.json(oneMonthsNotes);
    } else if (age === "3months") {
      let threeMonthsNotes = [];

      for (let data of dateNotesAndId) {
        if (
          (data.date <= Number(padTo2Digits(date.getDate())) &&
            12 >= data.month + 3 > Number(padTo2Digits(date.getMonth() + 1)) &&
            data.year === Number(padTo2Digits(date.getFullYear()))) ||
          (data.date >= Number(padTo2Digits(date.getDate())) &&
            data.month + 3 === Number(padTo2Digits(date.getMonth() + 1))) ||
          (data.month > Number(padTo2Digits(date.getMonth() + 1)) &&
            data.year + 1 === Number(padTo2Digits(date.getFullYear()))) ||
          (data.month === 10 &&
            data.date >= Number(padTo2Digits(date.getDate())) &&
            data.year + 1 === Number(padTo2Digits(date.getFullYear())))
        )
          threeMonthsNotes.push(await knex.table("notes").where({ _id: data.id, isArchived: null }).first());
      }

      threeMonthsNotes.map((entry) => {
        entry.page = page;
      });

      res.json(threeMonthsNotes);
    } else if (age === "alltime") {
      res.json(onArciveNotes);
    } else if (age === "archive") {
      let archiveNotes = await knex.table("notes").where({ isArchived: true, user_id: req.user.id });

      res.json(archiveNotes);
    }
  }
});
app.get("/getNotes:search", async (req, res) => {
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
app.post("/dashboard", async (req, res) => {
  if (req.user) {
    const { title, text } = req.body;

    const idNewNotes = nanoid();

    await knex.table("notes").insert({
      title: title,
      text: text,
      created: formatDate(new Date()),
      user_id: req.user.id,
      isArchived: null,
      _id: idNewNotes,
    });

    const newNote = await knex.table("notes").where({ _id: idNewNotes }).first();

    return res.json(newNote);
  }
});

app.get("/getNote:id", async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    const neededNote = await knex.table("notes").where({ _id: id }).first();

    res.json(neededNote);
  }
});

app.get("/archiveNote:id", async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    await knex.table("notes").where({ _id: id }).update({ isArchived: true });
    const archiveNote = await knex.table("notes").where({ _id: id }).first();

    return res.json(archiveNote);
  }
});

app.get("/unarchiveNote:id", async (req, res) => {
  if (req.user) {
    const id = req.params.id;

    await knex.table("notes").where({ _id: id }).update({ isArchived: null });
    const unarchiveNote = await knex.table("notes").where({ _id: id }).first();

    return res.json(unarchiveNote);
  }
});

app.put("/editNote", async (req, res) => {
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

app.get("/deleteNote:id", async (req, res) => {
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

app.get("/downloadNote:id", async (req, res) => {
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
          }, 1000);
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
