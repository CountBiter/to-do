require("dotenv").config();

const LocalStrategies = require("passport-local").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;

const passport = require("passport");

const crypto = require("crypto");
const { nanoid } = require("nanoid");

const port = process.env.PORT || 3000;

const hash = (d) => {
  return crypto.createHash("sha256").update(d).digest("hex");
};

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

passport.serializeUser((user, done) => {
  const idAndStategies = {};

  idAndStategies.id = user.id;
  idAndStategies.strategy = user.strategy;

  done(null, idAndStategies);
});

passport.deserializeUser(async (idAndStategies, done) => {
  try {
    if (idAndStategies.strategy === "local") {
      const result = await knex.table("users").where({ id: idAndStategies.id }).first();
      if (result) {
        done(null, result);
      }
    } else if (idAndStategies.strategy === "github") {
      const userGitHub = await knex.table("usersGitHub").where({ id: idAndStategies.id }).first();
      if (userGitHub) {
        done(null, userGitHub);
      }
    }
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  "local-login",
  new LocalStrategies(async (username, password, done) => {
    try {
      const result = await knex.table("users").where({ username: username }).first();
      const errMessage = "This user does not exist";
      if (!result) {
        done(errMessage, false);
      } else {
        if (result.password === hash(password)) {
          result.strategy = "local";
          done(null, result);
        } else {
          done(null, false);
        }
      }
    } catch (err) {
      done(err, false);
    }
  })
);

passport.use(
  "local-signup",
  new LocalStrategies(async (username, password, done) => {
    try {
      const nameTaken = await knex("users").where({ username: username }).first();
      const errMessage = new Error("This name is already taken");
      if (nameTaken) {
        throw errMessage;
      } else {
        const userId = nanoid();
        await knex.table("users").insert({
          username: username,
          password: hash(password),
          id: userId,
        });
        const newUser = await knex.table("users").where({ id: userId }).first();

        newUser.strategy = "local";

        done(null, newUser);
      }
    } catch (err) {
      done(err, false);
    }
  })
);

passport.use(
  "github",
  new GitHubStrategy(
    {
      clientID: "8c8febfc5bdca6244997",
      clientSecret: "1b15da7f2c17466ec5fefcef600c684e4e578a5d",
      callbackURL: `https://to-do-pr.herokuapp.com//auth/github/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const userGitHub = await knex.table("usersGitHub").where({ id: profile.id }).first();
        if (userGitHub) {
          userGitHub.strategy = "github";
          done(null, userGitHub);
        } else {
          await knex.table("usersGitHub").insert({
            username: profile.username,
            id: profile.id,
            photos: profile.photos[0].value,
          });
          const newUserGitHub = await knex.table("usersGitHub").where({ id: profile.id }).first();

          newUserGitHub.strategy = "github";

          done(null, newUserGitHub);
        }
      } catch (err) {
        done(err, false);
      }
    }
  )
);
