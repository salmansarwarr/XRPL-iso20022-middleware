const { Sequelize } = require('sequelize');
const mongoose = require('mongoose');

class DatabaseManager {
  constructor() {
    this.sequelize = null;
    this.mongoose = null;
  }

  async initPostgreSQL() {
    try {
      this.sequelize = new Sequelize(process.env.POSTGRES_URL, {
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });
      
      await this.sequelize.authenticate();
      console.info('PostgreSQL connected successfully');
      return this.sequelize;
    } catch (error) {
      console.error('PostgreSQL connection failed:', error);
      throw error;
    }
  }

  async initMongoDB() {
    try {
      await mongoose.connect(process.env.MONGO_URL);
      console.info('MongoDB connected successfully');
      return mongoose;
    } catch (error) {
      console.error('MongoDB connection failed:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseManager();