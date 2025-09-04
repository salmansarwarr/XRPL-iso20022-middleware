require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { Op } = require('sequelize');

const DatabaseManager = require('./config/database');
const logger = require('./config/logger');
const TransactionController = require('./controllers/TransactionController');
const ApiController = require('./controllers/ApiController');
const AuthMiddleware = require('./middleware/auth');
const SchedulerService = require('./services/SchedulerService');

const createTransactionRoutes = require('./routes/transactions');
const createApiRoutes = require('./routes/api');

class HoodieChickenMiddleware {
  constructor() {
    this.app = express();
    this.sequelize = null;
    this.schedulerService = null;
    this.server = null;
    
    // Bind methods to preserve context
    this.initialize = this.initialize.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.setupMiddleware = this.setupMiddleware.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.setupErrorHandling = this.setupErrorHandling.bind(this);
  }

  async initialize() {
    try {
      logger.info('Initializing Hoodie Chicken ISO 20022 Middleware...');
      
      // Initialize database connection
      logger.info('Connecting to database...');
      this.sequelize = await DatabaseManager.initPostgreSQL();
      
      // Initialize controllers with proper dependency injection
      logger.info('Initializing controllers...');
      this.transactionController = new TransactionController(this.sequelize);
      this.apiController = new ApiController(this.sequelize);
      this.authMiddleware = new AuthMiddleware(this.apiController);
      
      // Initialize scheduler service
      logger.info('Initializing scheduler service...');
      this.schedulerService = new SchedulerService(this.sequelize);
      
      // Setup Express middleware
      logger.info('Setting up middleware...');
      this.setupMiddleware();
      
      // Setup API routes
      logger.info('Setting up routes...');
      this.setupRoutes();
      
      // Setup error handling
      logger.info('Setting up error handling...');
      this.setupErrorHandling();
      
      // Sync database models
      logger.info('Syncing database models...');
      await this.sequelize.sync({ alter: true });
      
      // Start background scheduled jobs
      logger.info('Starting scheduled jobs...');
      if (process.env.NODE_ENV !== 'test') {
        this.schedulerService.startTransactionMonitoring();
        this.schedulerService.startValidationCleanup();
      }
      
      logger.info('Hoodie Chicken ISO 20022 Middleware initialized successfully');
      return this;
    } catch (error) {
      logger.error('Failed to initialize middleware:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
    
    // Security middleware - Configure helmet with appropriate settings
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration with environment-based origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];
    
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'development' ? '*' : allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      credentials: true,
      optionsSuccessStatus: 200
    }));
    
    // Compression middleware
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
      threshold: 1024
    }));
    
    // Body parsing middleware with appropriate limits
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb',
      parameterLimit: 1000
    }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      // Log request
      logger.info(`${req.method} ${req.path}`, {
        method: req.method,
        url: req.url,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      // Log response time
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: duration,
          ip: req.ip
        });
      });
      
      next();
    });
    
    // Rate limiting middleware (basic implementation)
    this.setupRateLimiting();
  }

  setupRateLimiting() {
    const rateLimit = new Map();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100; // requests per window
    
    this.app.use((req, res, next) => {
      // Skip rate limiting in test environment
      if (process.env.NODE_ENV === 'test') {
        return next();
      }
      
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old entries
      for (const [key, data] of rateLimit.entries()) {
        if (data.resetTime < now) {
          rateLimit.delete(key);
        }
      }
      
      // Check rate limit
      const userLimit = rateLimit.get(ip) || { count: 0, resetTime: now + windowMs };
      
      if (userLimit.resetTime < now) {
        userLimit.count = 0;
        userLimit.resetTime = now + windowMs;
      }
      
      userLimit.count++;
      rateLimit.set(ip, userLimit);
      
      if (userLimit.count > maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
        });
      }
      
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - userLimit.count),
        'X-RateLimit-Reset': userLimit.resetTime
      });
      
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint (no authentication required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });
    
    // API v1 routes
    this.app.use('/api/v1', createApiRoutes(this.apiController, this.authMiddleware));
    
    // Transaction routes
    this.app.use('/api/v1/transactions', createTransactionRoutes(this.transactionController, this.authMiddleware));
    
    // Root endpoint - API documentation
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Hoodie Chicken ISO 20022 Middleware',
        version: process.env.npm_package_version || '1.0.0',
        description: 'XRPL to ISO 20022 conversion middleware for Hoodie Chicken Token transactions',
        author: 'Hoodie Chicken Team',
        documentation: {
          swagger: '/api/v1/docs',
          postman: '/api/v1/postman'
        },
        endpoints: {
          health: '/health',
          status: '/api/v1/status',
          transactions: {
            list: 'GET /api/v1/transactions',
            process: 'POST /api/v1/transactions/process/{txHash}',
            get: 'GET /api/v1/transactions/{id}',
            xml: 'GET /api/v1/transactions/{id}/xml',
            revalidate: 'POST /api/v1/transactions/{id}/revalidate'
          },
          apiKeys: {
            generate: 'POST /api/v1/keys',
            list: 'GET /api/v1/keys',
            revoke: 'DELETE /api/v1/keys/{keyId}'
          }
        },
        supportedFormats: [
          'ISO 20022 pacs.008.001.08 (FI to FI Customer Credit Transfer)',
          'ISO 20022 pain.001.001.09 (Customer Credit Transfer Initiation)'
        ],
        blockchain: {
          network: 'XRPL',
          token: 'HCT (Hoodie Chicken Token)',
          node: process.env.XRPL_NODE
        }
      });
    });
    
    // API documentation routes
    this.app.get('/api/v1/docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Hoodie Chicken ISO 20022 Middleware API',
          version: '1.0.0',
          description: 'Convert XRPL HCT transactions to ISO 20022 compliant XML messages'
        },
        // Add OpenAPI spec here
        paths: this.generateOpenAPISpec()
      });
    });
  }

  generateOpenAPISpec() {
    return {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      timestamp: { type: 'string' },
                      uptime: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/transactions/process/{txHash}': {
        post: {
          summary: 'Process XRPL transaction',
          parameters: [
            {
              name: 'txHash',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'XRPL transaction hash'
            }
          ],
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Transaction processed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      transaction: { type: 'object' },
                      iso20022Xml: { type: 'string' },
                      validation: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  setupErrorHandling() {
    // 404 handler - must be after all routes
    this.app.use((req, res, next) => {
      const error = new Error(`Endpoint not found: ${req.method} ${req.path}`);
      error.status = 404;
      next(error);
    });
    
    // Global error handler
    this.app.use((err, req, res, next) => {
      // Set default error status
      err.status = err.status || err.statusCode || 500;
      
      // Log error details
      logger.error('Application error:', {
        error: err.message,
        stack: err.stack,
        status: err.status,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Prepare error response
      const errorResponse = {
        error: {
          message: err.message,
          status: err.status,
          timestamp: new Date().toISOString(),
          path: req.path
        }
      };
      
      // Include stack trace in development
      if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = err.stack;
        errorResponse.error.details = err.details;
      }
      
      // Handle specific error types
      if (err.name === 'ValidationError') {
        errorResponse.error.validation = err.errors;
      } else if (err.name === 'SequelizeValidationError') {
        errorResponse.error.validation = err.errors.map(e => ({
          field: e.path,
          message: e.message
        }));
      } else if (err.name === 'JsonWebTokenError') {
        errorResponse.error.message = 'Invalid authentication token';
        errorResponse.error.status = 401;
      }
      
      res.status(err.status).json(errorResponse);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      // Don't exit immediately, allow graceful shutdown
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit immediately, log and continue
    });
  }

  async start() {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, (error) => {
        if (error) {
          logger.error('Failed to start server:', error);
          reject(error);
          return;
        }
        
        logger.info(`🚀 Hoodie Chicken ISO 20022 Middleware started successfully!`);
        logger.info(`📡 Server listening on ${host}:${port}`);
        logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🔗 XRPL Node: ${process.env.XRPL_NODE || 'wss://xrplcluster.com'}`);
        logger.info(`💾 Database: ${process.env.DB_TYPE || 'postgresql'}`);
        logger.info(`📋 API Documentation: http://${host}:${port}/api/v1/docs`);
        logger.info(`❤️  Health Check: http://${host}:${port}/health`);
        
        resolve(this.server);
      });
      
      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        reject(error);
      });
    });
  }

  async stop() {
    logger.info('🛑 Stopping Hoodie Chicken ISO 20022 Middleware...');
    
    try {
      const shutdownPromises = [];
      
      // Stop scheduled jobs
      if (this.schedulerService) {
        logger.info('Stopping scheduled jobs...');
        this.schedulerService.stopAllJobs();
      }
      
      // Close database connections
      if (this.sequelize) {
        logger.info('Closing database connections...');
        shutdownPromises.push(this.sequelize.close());
      }
      
      // Close HTTP server
      if (this.server) {
        logger.info('Closing HTTP server...');
        shutdownPromises.push(new Promise((resolve, reject) => {
          this.server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        }));
      }
      
      // Wait for all shutdown operations
      await Promise.all(shutdownPromises);
      
      logger.info('✅ Hoodie Chicken ISO 20022 Middleware stopped gracefully');
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  // Utility method to get application status
  getStatus() {
    return {
      app: 'Hoodie Chicken ISO 20022 Middleware',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: this.sequelize ? 'connected' : 'disconnected',
      scheduler: this.schedulerService ? 'active' : 'inactive',
      timestamp: new Date().toISOString()
    };
  }
}

// Create and export the application instance
const middleware = new HoodieChickenMiddleware();

// Only start the server if this file is run directly (not imported)
if (require.main === module) {
  async function startApplication() {
    try {
      await middleware.initialize();
      await middleware.start();
      
      // Log startup success
      logger.info('🎉 Application startup completed successfully!');
      
    } catch (error) {
      logger.error('💥 Failed to start application:', error);
      process.exit(1);
    }
  }
  
  // Start the application
  startApplication();
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  logger.info('🔄 Received SIGINT (Ctrl+C), initiating graceful shutdown...');
  try {
    await middleware.stop();
    logger.info('👋 Goodbye!');
    process.exit(0);
  } catch (error) {
    logger.error('Error during SIGINT shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('🔄 Received SIGTERM, initiating graceful shutdown...');
  try {
    await middleware.stop();
    logger.info('👋 Goodbye!');
    process.exit(0);
  } catch (error) {
    logger.error('Error during SIGTERM shutdown:', error);
    process.exit(1);
  }
});

// Handle process warnings
process.on('warning', (warning) => {
  logger.warn('Process warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

module.exports = HoodieChickenMiddleware;