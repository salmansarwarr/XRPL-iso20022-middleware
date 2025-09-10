const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class ApiController {
  constructor(sequelize) {
    this.apiKeys = new Map(); // In production, use database
    this.initializeApiKeys();
  }

  initializeApiKeys() {
    // Default API key for testing
    const defaultKey = bcrypt.hashSync('default_api_key_12345', 10);
    this.apiKeys.set('default', {
      id: 'default',
      name: 'Default API Key',
      hashedKey: defaultKey,
      permissions: ['read', 'write'],
      createdAt: new Date(),
      lastUsed: null
    });
  }

  async generateApiKey(req, res) {
    try {
      const { name, permissions = ['read'] } = req.body;
      const apiKey = uuidv4();
      const hashedKey = bcrypt.hashSync(apiKey, 10);
      const keyId = uuidv4();

      this.apiKeys.set(keyId, {
        id: keyId,
        name: name,
        hashedKey: hashedKey,
        permissions: permissions,
        createdAt: new Date(),
        lastUsed: null
      });

      res.json({
        keyId: keyId,
        apiKey: apiKey, // Only returned once
        name: name,
        permissions: permissions
      });

      console.info(`Generated new API key: ${keyId} for ${name}`);
    } catch (error) {
      console.error('Error generating API key:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async listApiKeys(req, res) {
    try {
      const keys = Array.from(this.apiKeys.values()).map(key => ({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        createdAt: key.createdAt,
        lastUsed: key.lastUsed
      }));

      res.json({ apiKeys: keys });
    } catch (error) {
      console.error('Error listing API keys:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async revokeApiKey(req, res) {
    try {
      const { keyId } = req.params;
      
      if (this.apiKeys.has(keyId)) {
        this.apiKeys.delete(keyId);
        res.json({ message: 'API key revoked successfully' });
        console.info(`Revoked API key: ${keyId}`);
      } else {
        res.status(404).json({ error: 'API key not found' });
      }
    } catch (error) {
      console.error('Error revoking API key:', error);
      res.status(500).json({ error: error.message });
    }
  }

  validateApiKey(apiKey) {
    for (const [keyId, keyData] of this.apiKeys.entries()) {
      if (bcrypt.compareSync(apiKey, keyData.hashedKey)) {
        keyData.lastUsed = new Date();
        return keyData;
      }
    }
    return null;
  }
}

module.exports = ApiController;
