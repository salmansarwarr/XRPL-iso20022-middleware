// src/middleware/auth.js
const jwt = require('jsonwebtoken');

class AuthMiddleware {
  constructor(apiController) {
    if (!apiController) {
      throw new Error('API controller is required');
    }
    this.apiController = apiController;
    
    // Bind methods to preserve context
    this.authenticateApiKey = this.authenticateApiKey.bind(this);
    this.authenticateJWT = this.authenticateJWT.bind(this);
  }

  authenticateApiKey(requiredPermissions = []) {
    return (req, res, next) => {
      try {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        if (!apiKey) {
          return res.status(401).json({ 
            error: 'API key required',
            message: 'Please provide an API key in the x-api-key header or apiKey query parameter'
          });
        }

        const keyData = this.apiController.validateApiKey(apiKey);
        if (!keyData) {
          console.warn('Invalid API key attempted', {
            ip: req.ip,
            path: req.path,
            method: req.method
          });
          return res.status(401).json({ error: 'Invalid API key' });
        }

        // Check permissions
        if (requiredPermissions.length > 0) {
          const hasPermission = requiredPermissions.some(perm => 
            keyData.permissions && keyData.permissions.includes(perm)
          );
          if (!hasPermission) {
            console.warn('Insufficient permissions', {
              keyId: keyData.id,
              requiredPermissions,
              userPermissions: keyData.permissions,
              ip: req.ip,
              path: req.path
            });
            return res.status(403).json({ 
              error: 'Insufficient permissions',
              required: requiredPermissions,
              available: keyData.permissions
            });
          }
        }

        req.apiKey = keyData;
        console.debug('API key authenticated', {
          keyId: keyData.id,
          permissions: keyData.permissions
        });
        next();
      } catch (error) {
        console.error('Error in API key authentication:', error);
        res.status(500).json({ error: 'Authentication error' });
      }
    };
  }

  authenticateJWT() {
    return (req, res, next) => {
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') 
          ? authHeader.substring(7) 
          : null;
        
        if (!token) {
          return res.status(401).json({ 
            error: 'JWT token required',
            message: 'Please provide a JWT token in the Authorization header as "Bearer <token>"'
          });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        console.debug('JWT authenticated', {
          userId: decoded.sub || decoded.id,
          permissions: decoded.permissions
        });
        next();
      } catch (error) {
        console.error('JWT verification failed:', {
          error: error.message,
          ip: req.ip,
          path: req.path
        });
        
        if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({ error: 'Invalid token' });
        } else if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Token expired' });
        } else {
          return res.status(401).json({ error: 'Authentication failed' });
        }
      }
    };
  }

  // Optional: Method to create admin-only middleware
  requireAdmin() {
    return [
      this.authenticateApiKey(['admin']),
      (req, res, next) => {
        if (!req.apiKey.permissions.includes('admin')) {
          return res.status(403).json({ error: 'Admin privileges required' });
        }
        next();
      }
    ];
  }

  // Optional: Method to create read-only middleware
  requireReadAccess() {
    return this.authenticateApiKey(['read']);
  }

  // Optional: Method to create write access middleware
  requireWriteAccess() {
    return this.authenticateApiKey(['write']);
  }
}

module.exports = AuthMiddleware;