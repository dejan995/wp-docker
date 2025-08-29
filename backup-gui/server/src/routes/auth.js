// server/src/routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import db from "../db.js";

const router = express.Router();

// Register (only allowed if there are no users yet)
router.post("/register",
  body("email").isEmail(),
  body("password").isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json(errors.array());

    // Check if any user already exists
    const [rows] = await db.query("SELECT COUNT(*) AS count FROM users");
    if (rows[0].count > 0) {
      return res.status(403).json({ error: "Registration is closed. Ask the admin to create an account for you." });
    }

    const { email, password, name } = req.body;
    const hashed = await bcrypt.hash(password, 12);

    await db.query("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      [email, hashed, name]);

    res.json({ success: true });
  }
);

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.cookie("token", token, { httpOnly: true, sameSite: "strict" });
  res.json({ success: true });
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

// Get profile
router.get("/me", async (req, res) => {
  const [rows] = await db.query("SELECT id, email, name, gravatar_email FROM users WHERE id = ?", [req.user.id]);
  res.json(rows[0]);
});

// Update profile
router.put("/me", async (req, res) => {
  const { name, gravatar_email } = req.body;
  await db.query("UPDATE users SET name=?, gravatar_email=? WHERE id=?", [name, gravatar_email, req.user.id]);
  res.json({ success: true });
});

// Change password
router.put("/me/password", async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const [rows] = await db.query("SELECT password_hash FROM users WHERE id=?", [req.user.id]);
  
  const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if (!match) return res.status(400).json({ error: "Wrong password" });

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.query("UPDATE users SET password_hash=? WHERE id=?", [hashed, req.user.id]);
  res.json({ success: true });
});

export default router;
