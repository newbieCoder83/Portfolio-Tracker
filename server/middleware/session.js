const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const sessionMiddleware = session({
  secret: uuidv4(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // localhost only — no HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

module.exports = sessionMiddleware;
