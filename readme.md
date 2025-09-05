# Hoodie Chicken ISO 20022 Middleware

🐔 Convert XRPL Hoodie Chicken Token transactions to ISO 20022 compliant XML messages.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- PostgreSQL 12+
- npm 8+

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd hoodie-chicken-iso20022-middleware
npm install
```

2. **Setup environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Setup database:**
```bash
# Create PostgreSQL database
createdb hct_middleware

# Update POSTGRES_URL in .env file
POSTGRES_URL=postgresql://username:password@localhost:5432/hct_middleware
```

4. **Test components:**
```bash
npm run test:components
# or
npm run debug
```

5. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔧 Troubleshooting

### Error: "Cannot read properties of undefined (reading 'bind')"

This error occurs when controllers or middleware aren't properly initialized. Run the debug script:

```bash
npm run debug
```

Common fixes:
1. **Missing dependencies:** Run `npm install`
2. **Database connection:** Ensure PostgreSQL is running and POSTGRES_URL is correct
3. **Environment variables:** Check .env file is properly configured

### Database Issues

1. **PostgreSQL not running:**
```bash
# Start PostgreSQL
sudo service postgresql start
# or on macOS with Homebrew
brew services start postgresql
```

2. **Database doesn't exist:**
```bash
createdb hct_middleware
```

3. **Connection refused:**
- Check PostgreSQL is accepting connections
- Verify username/password in POSTGRES_URL
- Ensure database exists

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

## 📡 API Usage

### 1. Generate API Key
```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "permissions": ["read", "write"]}'
```

### 2. Process XRPL Transaction
```bash
curl -X POST http://localhost:3000/api/v1/transactions/process/YOUR_TX_HASH \
  -H "x-api-key: your-api-key-here"
```

### 3. Get Transaction List
```bash
curl http://localhost:3000/api/v1/transactions \
  -H "x-api-key: your-api-key-here"
```

### 4. Get ISO 20022 XML
```bash
curl http://localhost:3000/api/v1/transactions/TRANSACTION_ID/xml \
  -H "x-api-key: your-api-key-here"
```

## 📊 Health Check

```bash
curl http://localhost:3000/health
```

## 🏗️ Architecture

```
XRPL Transaction → API Listener → Mapping Engine → XML Generator → Validator → Database → Output API
```

## 🔐 Security

- API key authentication
- Rate limiting (100 requests/15 minutes)
- CORS protection
- Input validation
- Secure headers via Helmet

## 📄 Supported ISO 20022 Messages

- **pacs.008.001.08** - FI to FI Customer Credit Transfer
- **pain.001.001.09** - Customer Credit Transfer Initiation

## 🛠️ Development

### Project Structure
```
src/
├── app.js                  # Main application
├── config/
│   ├── database.js        # Database configuration
│   └── logger.js          # Winston logger
├── controllers/
│   ├── TransactionController.js
│   └── ApiController.js
├── middleware/
│   └── auth.js            # Authentication
├── models/
│   └── Transaction.js     # Sequelize model
├── routes/
│   ├── transactions.js
│   └── api.js
└── services/
    ├── XRPLService.js     # XRPL integration
    ├── MappingEngine.js   # XRPL to ISO mapping
    ├── XMLGenerator.js    # ISO 20022 XML generation
    ├── ValidationService.js # XML validation
    └── SchedulerService.js # Background jobs
```

### Testing
```bash
# Test all components
npm test

# Debug startup
npm run debug

# Development with auto-reload
npm run dev
```

## 🌍 Environment Variables

See `.env.example` for all configuration options.

## 📚 Documentation

- API docs: `http://localhost:3000/api/v1/docs`
- Health check: `http://localhost:3000/health`
- Status: `http://localhost:3000/api/v1/status`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## 📝 License

MIT License - see LICENSE file for details.