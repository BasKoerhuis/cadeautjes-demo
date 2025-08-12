import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import database from '../models/database'

const router = express.Router()
const JWT_SECRET = 'demo-secret-key' // In production, use environment variable

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, name, password, deviceId } = req.body

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' })
    }

    // Check if user already exists
    const existingUser = await database.async.get('SELECT id FROM users WHERE email = ?', [email])
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const result = await database.async.run(
      'INSERT INTO users (email, name, password_hash, device_id) VALUES (?, ?, ?, ?)',
      [email, name, hashedPassword, deviceId]
    )

    const userId = result.lastID

    // Generate JWT token
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({
      message: 'User created successfully',
      user: { id: userId, email, name },
      token
    })

  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, deviceId } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user
    const user = await database.async.get('SELECT * FROM users WHERE email = ?', [email])
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Update device ID if provided
    if (deviceId) {
      await database.async.run('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, user.id])
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, name: user.name },
      token
    })

  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Demo login (for quick testing)
router.post('/demo-login', async (req, res) => {
  try {
    const user = await database.async.get('SELECT * FROM users WHERE email = ?', ['demo@cadeautjes.app'])
    
    if (!user) {
      return res.status(404).json({ error: 'Demo user not found' })
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      message: 'Demo login successful',
      user: { id: user.id, email: user.email, name: user.name },
      token
    })

  } catch (error) {
    console.error('Demo login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router