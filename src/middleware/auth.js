const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

class AuthMiddleware {
  constructor(apiController) {
    this.apiController = apiController;
  }

  authenticateApiKey(requiredPermissions = []) {
    return (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      
      if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }

      const keyData = this.apiController.validateApiKey(apiKey);
      if (!keyData) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Check permissions
      if (requiredPermissions.length > 0) {
        const hasPermission = requiredPermissions.some(perm => keyData.permissions.includes(perm));
        if (!hasPermission) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }

      req.apiKey = keyData;
      next();
    };
  }

  authenticateJWT() {
    return (req, res, next) => {
      const token = req.headers['authorization']?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'JWT token required' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (error) {
        logger.error('JWT verification failed:', error);
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }
}

module.exports = AuthMiddleware;