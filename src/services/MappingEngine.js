const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

class MappingEngine {
  constructor() {
    this.messageTypes = {
      PAYMENT: 'pacs.008',
      PAYMENT_INITIATION: 'pain.001'
    };
  }

  mapXRPLToISO20022(xrplTransaction, messageType = 'pacs.008') {
    try {
      const mappedData = {
        messageId: uuidv4(),
        creationDateTime: new Date().toISOString(),
        numberOfTransactions: '1',
        controlSum: this.extractAmount(xrplTransaction.Amount),
        instructionId: xrplTransaction.hash || uuidv4(),
        endToEndId: xrplTransaction.hash || uuidv4(),
        transactionId: xrplTransaction.hash,
        instructedAmount: {
          currency: xrplTransaction.Amount.currency || 'HCT',
          value: this.extractAmount(xrplTransaction.Amount)
        },
        debtor: {
          name: this.extractAccountName(xrplTransaction.Account) || 'Unknown',
          identification: xrplTransaction.Account,
          address: this.extractAccountAddress(xrplTransaction.Account)
        },
        debtorAccount: {
          identification: xrplTransaction.Account,
          currency: xrplTransaction.Amount.currency || 'HCT'
        },
        creditor: {
          name: this.extractAccountName(xrplTransaction.Destination) || 'Unknown',
          identification: xrplTransaction.Destination,
          address: this.extractAccountAddress(xrplTransaction.Destination)
        },
        creditorAccount: {
          identification: xrplTransaction.Destination,
          currency: xrplTransaction.Amount.currency || 'HCT'
        },
        remittanceInformation: this.extractRemittanceInfo(xrplTransaction),
        chargeBearer: 'SLEV',
        purposeCode: 'CBFF' // Crypto/Blockchain transaction
      };

      logger.info(`Mapped XRPL transaction ${xrplTransaction.hash} to ISO 20022 format`);
      return mappedData;
    } catch (error) {
      logger.error('Error mapping XRPL to ISO 20022:', error);
      throw error;
    }
  }

  extractAmount(amount) {
    if (typeof amount === 'string') {
      return (parseInt(amount) / 1000000).toString(); // Convert drops to XRP
    } else if (typeof amount === 'object') {
      return amount.value;
    }
    return '0';
  }

  extractAccountName(account) {
    // This could be enhanced to look up actual names from a registry
    return `Account_${account.substring(0, 8)}`;
  }

  extractAccountAddress(account) {
    return {
      addressType: 'ADDR',
      department: 'XRPL',
      streetName: account,
      buildingNumber: '1',
      postCode: '00000',
      townName: 'Digital',
      country: 'XX'
    };
  }

  extractRemittanceInfo(transaction) {
    const memo = this.extractMemo(transaction);
    return {
      unstructured: memo || `HCT Transfer - ${transaction.hash}`
    };
  }

  extractMemo(transaction) {
    if (transaction.Memos && transaction.Memos.length > 0) {
      const memo = transaction.Memos[0].Memo;
      if (memo.MemoData) {
        return Buffer.from(memo.MemoData, 'hex').toString('utf8');
      }
    }
    return null;
  }
}

module.exports = MappingEngine;
