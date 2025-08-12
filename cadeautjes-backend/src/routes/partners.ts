import express from 'express'
import database from '../models/database'

const router = express.Router()

// Partner application
router.post('/apply', async (req, res) => {
  try {
    const {
      businessName,
      ownerName,
      email,
      phone,
      address,
      city,
      businessType,
      description
    } = req.body

    if (!businessName || !ownerName || !email) {
      return res.status(400).json({ error: 'Business name, owner name, and email are required' })
    }

    // Check if partner already exists
    const existingPartner = await database.async.get(
      'SELECT id FROM partners WHERE email = ?',
      [email]
    )

    if (existingPartner) {
      return res.status(409).json({ error: 'Partner application already exists' })
    }

    // Create partner application
    const result = await database.async.run(`
      INSERT INTO partners (
        business_name, owner_name, email, phone, address, city, business_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [businessName, ownerName, email, phone, address, city, businessType])

    res.status(201).json({
      message: 'Partner application submitted successfully',
      partnerId: result.lastID
    })

  } catch (error) {
    console.error('Partner application error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Validate and redeem QR code (for partners)
router.post('/redeem', async (req, res) => {
  try {
    const { qrCode, partnerId } = req.body

    if (!qrCode) {
      return res.status(400).json({ error: 'QR code is required' })
    }

    // Find transaction by QR code
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
      WHERE t.qr_code = ? AND t.status = 'sent'
    `, [qrCode])

    if (!transaction) {
      return res.status(404).json({ 
        error: 'Invalid QR code or gift already redeemed' 
      })
    }

    // Mark as redeemed
    await database.async.run(`
      UPDATE transactions 
      SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP, partner_id = ?
      WHERE id = ?
    `, [partnerId || null, transaction.id])

    res.json({
      message: 'Gift redeemed successfully',
      gift: {
        name: transaction.name,
        emoji: transaction.emoji,
        description: transaction.description,
        price: transaction.price,
        senderName: transaction.sender_name
      },
      amount: transaction.price,
      transactionId: transaction.id
    })

  } catch (error) {
    console.error('Redeem error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get partner statistics (mock for demo)
router.get('/stats/:partnerId', async (req, res) => {
  try {
    const { partnerId } = req.params

    // Get redeemed transactions for this partner
    const transactions = await database.async.all(`
      SELECT 
        t.*,
        gt.name,
        gt.price,
        gt.emoji
      FROM transactions t
      JOIN gift_types gt ON t.gift_type_id = gt.id
      WHERE t.partner_id = ? AND t.status = 'redeemed'
      ORDER BY t.redeemed_at DESC
    `, [partnerId])

    const totalAmount = transactions.reduce((sum, t) => sum + t.price, 0)
    const totalTransactions = transactions.length

    // Group by gift type
    const giftStats = transactions.reduce((acc, t) => {
      const key = t.gift_type_id
      if (!acc[key]) {
        acc[key] = {
          name: t.name,
          emoji: t.emoji,
          count: 0,
          totalValue: 0
        }
      }
      acc[key].count++
      acc[key].totalValue += t.price
      return acc
    }, {} as any)

    res.json({
      partnerId,
      totalAmount,
      totalTransactions,
      giftStats: Object.values(giftStats),
      recentTransactions: transactions.slice(0, 10)
    })

  } catch (error) {
    console.error('Partner stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Demo partner login (for testing scanner)
router.post('/demo-login', async (req, res) => {
  try {
    // Create or get demo partner
    let partner = await database.async.get(
      'SELECT * FROM partners WHERE email = ?',
      ['demo-partner@cadeautjes.app']
    )

    if (!partner) {
      const result = await database.async.run(`
        INSERT INTO partners (
          business_name, owner_name, email, phone, city, business_type, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        'Demo Café',
        'Demo Owner',
        'demo-partner@cadeautjes.app',
        '020-1234567',
        'Amsterdam',
        'horeca',
        'approved'
      ])

      partner = {
        id: result.lastID,
        business_name: 'Demo Café',
        owner_name: 'Demo Owner',
        email: 'demo-partner@cadeautjes.app'
      }
    }

    res.json({
      message: 'Demo partner login successful',
      partner: {
        id: partner.id,
        businessName: partner.business_name,
        ownerName: partner.owner_name,
        email: partner.email
      }
    })

  } catch (error) {
    console.error('Demo partner login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router