const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const router = express.Router();

// In-memory user store (for demo purposes)
const users = [];

// Helper to generate JWT
function generateToken(user) {
  const payload = { id: user.id, email: user.email };
  const secret = process.env.JWT_SECRET || 'default_secret';
  const expiresIn = process.env.TOKEN_EXPIRY || '1h';
  return jwt.sign(payload, secret, { expiresIn });
}

// Signup route
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const existing = users.find(u => u.email === email);
  if (existing) {
    return res.status(409).json({ message: 'User already exists.' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    const newUser = { id: users.length + 1, email, password: hashed };
    users.push(newUser);
    const token = generateToken(newUser);
    res.status(201).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }
  try {
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const token = generateToken(user);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
