const { Sequelize } = require('sequelize');
const mongoose = require('mongoose');
const logger = require('./logger');

class DatabaseManager {
  constructor() {
    this.sequelize = null;
    this.mongoose = null;
  }

  async initPostgreSQL() {
    try {
      this.sequelize = new Sequelize(process.env.POSTGRES_URL, {
        logging: (msg) => logger.debug(msg),
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });
      
      await this.sequelize.authenticate();
      logger.info('PostgreSQL connected successfully');
      return this.sequelize;
    } catch (error) {
      logger.error('PostgreSQL connection failed:', error);
      throw error;
    }
  }

  async initMongoDB() {
    try {
      await mongoose.connect(process.env.MONGO_URL);
      logger.info('MongoDB connected successfully');
      return mongoose;
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseManager();