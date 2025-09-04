const { DataTypes } = require('sequelize');

const TransactionModel = (sequelize) => {
  return sequelize.define('Transaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    xrplTxHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    fromAddress: {
      type: DataTypes.STRING,
      allowNull: false
    },
    toAddress: {
      type: DataTypes.STRING,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'HCT'
    },
    memo: {
      type: DataTypes.TEXT
    },
    rawTransaction: {
      type: DataTypes.JSONB
    },
    iso20022Xml: {
      type: DataTypes.TEXT
    },
    validationStatus: {
      type: DataTypes.ENUM('pending', 'valid', 'invalid'),
      defaultValue: 'pending'
    },
    validationErrors: {
      type: DataTypes.JSONB
    },
    processed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    processedAt: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'transactions',
    timestamps: true
  });
};

module.exports = TransactionModel;