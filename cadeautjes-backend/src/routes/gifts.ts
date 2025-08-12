import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'qrcode'
import database from '../models/database'
import { authenticateToken } from '../middleware/auth'

const router = express.Router()

// Get all available gift types
router.get('/types', async (req, res) => {
  try {
    const giftTypes = await database.async.all(
      'SELECT * FROM gift_types WHERE active = 1 ORDER BY category, name'
    )

    res.json({ giftTypes })
  } catch (error) {
    console.error('Error fetching gift types:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Purchase gifts (from website)
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body // [{ giftTypeId, quantity }]
    
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }
    
    const userId = req.user.userId

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' })
    }

    let totalAmount = 0
    const purchaseId = uuidv4()

    // Calculate total and validate items
    for (const item of items) {
      const giftType = await database.async.get(
        'SELECT * FROM gift_types WHERE id = ? AND active = 1',
        [item.giftTypeId]
      )

      if (!giftType) {
        return res.status(400).json({ error: `Invalid gift type: ${item.giftTypeId}` })
      }

      totalAmount += giftType.price * item.quantity

      // Add to user's inventory
      const existingInventory = await database.async.get(
        'SELECT * FROM user_gifts WHERE user_id = ? AND gift_type_id = ?',
        [userId, item.giftTypeId]
      )

      if (existingInventory) {
        await database.async.run(
          'UPDATE user_gifts SET quantity = quantity + ? WHERE user_id = ? AND gift_type_id = ?',
          [item.quantity, userId, item.giftTypeId]
        )
      } else {
        await database.async.run(
          'INSERT INTO user_gifts (user_id, gift_type_id, quantity) VALUES (?, ?, ?)',
          [userId, item.giftTypeId, item.quantity]
        )
      }
    }

    // Record purchase
    await database.async.run(
      'INSERT INTO purchases (id, user_id, items, total_amount) VALUES (?, ?, ?, ?)',
      [purchaseId, userId, JSON.stringify(items), totalAmount]
    )

    res.json({
      message: 'Purchase successful',
      purchaseId,
      totalAmount,
      items
    })

  } catch (error) {
    console.error('Purchase error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user's gift inventory
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }
    
    const userId = req.user.userId

    const inventory = await database.async.all(`
      SELECT 
        ug.quantity,
        gt.id as gift_type_id,
        gt.name,
        gt.emoji,
        gt.description,
        gt.price,
        gt.category
      FROM user_gifts ug
      JOIN gift_types gt ON ug.gift_type_id = gt.id
      WHERE ug.user_id = ? AND ug.quantity > 0
      ORDER BY gt.category, gt.name
    `, [userId])

    res.json({ inventory })

  } catch (error) {
    console.error('Error fetching inventory:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Send a gift (create transaction)
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { giftTypeId, receiverEmail, message } = req.body
    
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }
    
    const userId = req.user.userId

    if (!giftTypeId) {
      return res.status(400).json({ error: 'Gift type ID is required' })
    }

    // Check if user has this gift
    const userGift = await database.async.get(
      'SELECT * FROM user_gifts WHERE user_id = ? AND gift_type_id = ? AND quantity > 0',
      [userId, giftTypeId]
    )

    if (!userGift) {
      return res.status(400).json({ error: 'You do not have this gift available' })
    }

    // Get gift details
    const giftType = await database.async.get(
      'SELECT * FROM gift_types WHERE id = ?',
      [giftTypeId]
    )

    // Generate transaction ID and QR code
    const transactionId = uuidv4()
    const qrCodeData = `CADEAUTJE-${transactionId}`
    
    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(qrCodeData)

    // Create transaction
    await database.async.run(
      'INSERT INTO transactions (id, sender_id, receiver_email, gift_type_id, qr_code, message) VALUES (?, ?, ?, ?, ?, ?)',
      [transactionId, userId, receiverEmail, giftTypeId, qrCodeData, message]
    )

    // Decrease user's inventory
    await database.async.run(
      'UPDATE user_gifts SET quantity = quantity - 1 WHERE user_id = ? AND gift_type_id = ?',
      [userId, giftTypeId]
    )

    res.json({
      message: 'Gift sent successfully',
      transactionId,
      gift: {
        name: giftType.name,
        emoji: giftType.emoji,
        description: giftType.description
      },
      qrCode: qrCodeDataURL,
      claimUrl: `https://cadeautjes.app/claim/${transactionId}`
    })

  } catch (error) {
    console.error('Send gift error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get sent gifts history
router.get('/sent', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }
    
    const userId = req.user.userId

    const sentGifts = await database.async.all(`
      SELECT 
        t.id,
        t.receiver_email,
        t.status,
        t.message,
        t.created_at,
        t.redeemed_at,
        gt.name,
        gt.emoji,
        gt.description,
        gt.price
      FROM transactions t
      JOIN gift_types gt ON t.gift_type_id = gt.id
      WHERE t.sender_id = ?
      ORDER BY t.created_at DESC
    `, [userId])

    res.json({ sentGifts })

  } catch (error) {
    console.error('Error fetching sent gifts:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Claim a gift (for receivers)
router.get('/claim/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params

    const transaction = await database.async.get(`
      SELECT 
        t.*,
        gt.name,
        gt.emoji,
        gt.description,
        gt.price,
        u.name as sender_name
      FROM transactions t
      JOIN gift_types gt ON t.gift_type_id = gt.id
      JOIN users u ON t.sender_id = u.id
      WHERE t.id = ?
    `, [transactionId])

    if (!transaction) {
      return res.status(404).json({ error: 'Gift not found' })
    }

    if (transaction.status === 'redeemed') {
      return res.status(410).json({ error: 'Gift already redeemed' })
    }

    // Generate QR code for display
    const qrCodeDataURL = await QRCode.toDataURL(transaction.qr_code)

    res.json({
      gift: {
        id: transaction.id,
        name: transaction.name,
        emoji: transaction.emoji,
        description: transaction.description,
        price: transaction.price,
        message: transaction.message,
        senderName: transaction.sender_name,
        createdAt: transaction.created_at,
        qrCode: qrCodeDataURL
      }
    })

  } catch (error) {
    console.error('Error claiming gift:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Sync gifts to iOS app (for keyboard extension)
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }
    
    const userId = req.user.userId
    const { deviceId } = req.body

    // Update device ID
    if (deviceId) {
      await database.async.run('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, userId])
    }

    // Get inventory for keyboard
    const inventory = await database.async.all(`
      SELECT 
        gt.id,
        gt.name,
        gt.emoji,
        gt.category,
        ug.quantity
      FROM user_gifts ug
      JOIN gift_types gt ON ug.gift_type_id = gt.id
      WHERE ug.user_id = ? AND ug.quantity > 0
      ORDER BY ug.quantity DESC, gt.name
    `, [userId])

    // Get recent sent gifts
    const recentSent = await database.async.all(`
      SELECT 
        t.id,
        t.created_at,
        gt.name,
        gt.emoji
      FROM transactions t
      JOIN gift_types gt ON t.gift_type_id = gt.id
      WHERE t.sender_id = ?
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [userId])

    res.json({
      inventory,
      recentSent,
      syncTime: new Date().toISOString()
    })

  } catch (error) {
    console.error('Sync error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router