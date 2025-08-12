import Database from 'better-sqlite3'

interface DatabaseInterface {
  get: (sql: string, params?: any[]) => any
  all: (sql: string, params?: any[]) => any[]
  run: (sql: string, params?: any[]) => { lastInsertRowid?: number; changes?: number }
}

class DatabaseManager {
  private db: Database.Database
  public async: DatabaseInterface

  constructor() {
    this.db = new Database('./cadeautjes.db')
    
    // better-sqlite3 is synchronous, so we create a sync interface
    this.async = {
      get: (sql: string, params?: any[]) => this.db.prepare(sql).get(params),
      all: (sql: string, params?: any[]) => this.db.prepare(sql).all(params),
      run: (sql: string, params?: any[]) => this.db.prepare(sql).run(params)
    }
    
    this.initializeTables()
  }

  private initializeTables() {
    try {
      // Users table
      this.async.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          device_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Gift types table
      this.async.run(`
        CREATE TABLE IF NOT EXISTS gift_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          emoji TEXT NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL,
          category TEXT NOT NULL,
          active BOOLEAN DEFAULT 1
        )
      `)

      // User gift inventory
      this.async.run(`
        CREATE TABLE IF NOT EXISTS user_gifts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          gift_type_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (gift_type_id) REFERENCES gift_types (id)
        )
      `)

      // Transactions table
      this.async.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          sender_id INTEGER NOT NULL,
          receiver_email TEXT,
          gift_type_id INTEGER NOT NULL,
          status TEXT DEFAULT 'sent',
          qr_code TEXT UNIQUE,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          redeemed_at DATETIME,
          partner_id INTEGER,
          FOREIGN KEY (sender_id) REFERENCES users (id),
          FOREIGN KEY (gift_type_id) REFERENCES gift_types (id)
        )
      `)

      // Partners table
      this.async.run(`
        CREATE TABLE IF NOT EXISTS partners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          business_name TEXT NOT NULL,
          owner_name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          address TEXT,
          city TEXT,
          business_type TEXT,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Purchases table (for website purchases)
      this.async.run(`
        CREATE TABLE IF NOT EXISTS purchases (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          items TEXT NOT NULL,
          total_amount DECIMAL(10,2) NOT NULL,
          status TEXT DEFAULT 'completed',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `)

      console.log('✅ Database tables initialized')
      
      // Insert sample gift types
      this.insertSampleData()
      
    } catch (error) {
      console.error('❌ Database initialization error:', error)
    }
  }

  private insertSampleData() {
    // Check if gift types already exist
    const existingGifts = this.async.get('SELECT COUNT(*) as count FROM gift_types')
    
    if (existingGifts.count === 0) {
      const giftTypes = [
        // Drinks
        { name: 'Biertje', emoji: '🍺', description: 'Een lekker biertje bij deelnemende cafés', price: 3.50, category: 'drinks' },
        { name: 'Wijntje', emoji: '🍷', description: 'Een glas wijn bij restaurants', price: 4.50, category: 'drinks' },
        { name: 'Koffie', emoji: '☕', description: 'Verse koffie bij coffeeshops', price: 2.75, category: 'drinks' },
        { name: 'Cocktail', emoji: '🍸', description: 'Een cocktail naar keuze', price: 7.50, category: 'drinks' },
        
        // Food
        { name: 'Pizza Slice', emoji: '��', description: 'Een punt pizza bij pizzeria', price: 3.25, category: 'food' },
        { name: 'Taartje', emoji: '🍰', description: 'Een stuk taart bij bakkerij', price: 3.75, category: 'food' },
        { name: 'Lunch', emoji: '🥪', description: 'Lunch deal bij restaurants', price: 8.50, category: 'food' },
        { name: 'IJsje', emoji: '🍨', description: 'Een bolletje ijs naar keuze', price: 2.25, category: 'food' },
        
        // Entertainment
        { name: 'Bioscoopkaartje', emoji: '🎬', description: 'Ticket voor voorstelling', price: 12.50, category: 'entertainment' },
        { name: 'Minigolf', emoji: '⛳', description: 'Een rondje minigolf', price: 7.00, category: 'entertainment' },
        { name: 'Bowling Game', emoji: '🎳', description: 'Een spelletje bowlen', price: 5.50, category: 'entertainment' },
        
        // Lifestyle
        { name: 'Boodschappen', emoji: '🛒', description: 'Boodschappen tegoed', price: 10.00, category: 'lifestyle' },
        { name: 'Bloemen', emoji: '💐', description: 'Een mooi boeket bloemen', price: 12.00, category: 'lifestyle' },
      ]

      for (const gift of giftTypes) {
        this.async.run(
          'INSERT INTO gift_types (name, emoji, description, price, category) VALUES (?, ?, ?, ?, ?)',
          [gift.name, gift.emoji, gift.description, gift.price, gift.category]
        )
      }
      
      console.log('✅ Sample gift types inserted')
    }

    // Create demo user
    const existingUser = this.async.get('SELECT id FROM users WHERE email = ?', ['demo@cadeautjes.app'])
    
    if (!existingUser) {
      const bcrypt = require('bcryptjs')
      const hashedPassword = bcrypt.hashSync('demo123', 10)
      
      this.async.run(
        'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
        ['demo@cadeautjes.app', 'Demo User', hashedPassword]
      )
      
      console.log('✅ Demo user created: demo@cadeautjes.app / demo123')
    }
  }

  close() {
    this.db.close()
  }
}

export const database = new DatabaseManager()
export default database
