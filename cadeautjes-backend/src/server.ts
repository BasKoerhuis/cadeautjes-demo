import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

// Import routes
import authRoutes from './routes/auth'
import giftsRoutes from './routes/gifts'
import partnersRoutes from './routes/partners'

// Import database to initialize
import './models/database'

const app = express()
const PORT = Number(process.env.PORT) || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// Security middleware
app.use(helmet())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})
app.use(limiter)

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', // Website
    'http://localhost:3001', // Backend
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'cadeautjesapp://', // iOS app deep links
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/gifts', giftsRoutes)
app.use('/api/partners', partnersRoutes)

// Demo endpoints for quick testing
app.get('/api/demo/status', (req, res) => {
  res.json({
    message: 'Cadeautjes API Demo',
    endpoints: {
      auth: {
        'POST /api/auth/demo-login': 'Quick demo login',
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'User login'
      },
      gifts: {
        'GET /api/gifts/types': 'Get all gift types',
        'POST /api/gifts/purchase': 'Purchase gifts (requires auth)',
        'GET /api/gifts/inventory': 'Get user inventory (requires auth)',
        'POST /api/gifts/send': 'Send a gift (requires auth)',
        'GET /api/gifts/sent': 'Get sent gifts history (requires auth)',
        'GET /api/gifts/claim/:id': 'Claim a gift (public)',
        'POST /api/gifts/sync': 'Sync for iOS app (requires auth)'
      },
      partners: {
        'POST /api/partners/apply': 'Partner application',
        'POST /api/partners/demo-login': 'Demo partner login',
        'POST /api/partners/redeem': 'Redeem QR code',
        'GET /api/partners/stats/:id': 'Partner statistics'
      }
    },
    demo: {
      user: 'demo@cadeautjes.app / demo123',
      partner: 'demo-partner@cadeautjes.app'
    }
  })
})

// Quick demo data endpoint
app.get('/api/demo/sample-purchase', async (req, res) => {
  try {
    // This endpoint simulates a purchase for demo purposes
    res.json({
      message: 'Sample purchase data',
      sampleRequest: {
        method: 'POST',
        url: '/api/gifts/purchase',
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN',
          'Content-Type': 'application/json'
        },
        body: {
          items: [
            { giftTypeId: 1, quantity: 3 }, // 3 biertjes
            { giftTypeId: 2, quantity: 2 }  // 2 wijntjes
          ]
        }
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Demo error' })
  }
})

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: '/api/demo/status'
  })
})

// Start server
app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`🚀 Cadeautjes API Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🌐 External access: http://192.168.2.100:${PORT}/health`)
  console.log(`📋 Demo endpoints: http://localhost:${PORT}/api/demo/status`)
  console.log(`👤 Demo user: demo@cadeautjes.app / demo123`)
  console.log(`🏪 Demo partner: demo-partner@cadeautjes.app`)
  console.log('')
  console.log('Ready for investor demo! 🎯')
})

export default app