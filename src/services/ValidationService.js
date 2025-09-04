const axios = require('axios');
const { parseString } = require('xml2js');
const logger = require('../config/logger');

class ValidationService {
  constructor() {
    this.swiftSandboxUrl = process.env.SWIFT_SANDBOX_URL;
    this.validationRules = this.loadValidationRules();
  }

  loadValidationRules() {
    return {
      pacs008: {
        required: ['MsgId', 'CreDtTm', 'NbOfTxs', 'InstrId', 'EndToEndId'],
        maxLength: {
          'MsgId': 35,
          'InstrId': 35,
          'EndToEndId': 35
        },
        patterns: {
          'MsgId': /^[A-Za-z0-9\-]+$/,
          'Amount': /^\d+\.\d{2}$/
        }
      },
      pain001: {
        required: ['MsgId', 'CreDtTm', 'NbOfTxs', 'EndToEndId'],
        maxLength: {
          'MsgId': 35,
          'EndToEndId': 35
        }
      }
    };
  }

  async validateXML(xmlString, messageType = 'pacs.008') {
    const results = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Basic XML structure validation
      await this.validateXMLStructure(xmlString);
      
      // ISO 20022 specific validation
      await this.validateISO20022Rules(xmlString, messageType);
      
      // SWIFT MyStandards validation (if available)
      if (this.swiftSandboxUrl) {
        const swiftResults = await this.validateWithSWIFT(xmlString, messageType);
        results.swiftValidation = swiftResults;
      }

      logger.info(`XML validation completed for ${messageType}`);
      return results;
    } catch (error) {
      results.isValid = false;
      results.errors.push(error.message);
      logger.error('XML validation failed:', error);
      return results;
    }
  }

  async validateXMLStructure(xmlString) {
    return new Promise((resolve, reject) => {
      parseString(xmlString, { explicitArray: false }, (err, result) => {
        if (err) {
          reject(new Error(`XML structure invalid: ${err.message}`));
        } else {
          resolve(result);
        }
      });
    });
  }

  async validateISO20022Rules(xmlString, messageType) {
    const rules = this.validationRules[messageType.replace('.', '')];
    if (!rules) return;

    // Parse XML to validate rules
    const parsed = await this.validateXMLStructure(xmlString);
    
    // Check required fields
    for (const field of rules.required) {
      if (!this.findFieldInXML(parsed, field)) {
        throw new Error(`Required field ${field} is missing`);
      }
    }

    // Check field lengths
    for (const [field, maxLen] of Object.entries(rules.maxLength)) {
      const value = this.findFieldInXML(parsed, field);
      if (value && value.length > maxLen) {
        throw new Error(`Field ${field} exceeds maximum length of ${maxLen}`);
      }
    }

    // Check patterns
    for (const [field, pattern] of Object.entries(rules.patterns)) {
      const value = this.findFieldInXML(parsed, field);
      if (value && !pattern.test(value)) {
        throw new Error(`Field ${field} does not match required pattern`);
      }
    }
  }

  findFieldInXML(obj, fieldName) {
    if (typeof obj !== 'object') return null;
    
    for (const key in obj) {
      if (key === fieldName) return obj[key];
      if (typeof obj[key] === 'object') {
        const result = this.findFieldInXML(obj[key], fieldName);
        if (result) return result;
      }
    }
    return null;
  }

  async validateWithSWIFT(xmlString, messageType) {
    try {
      const response = await axios.post(`${this.swiftSandboxUrl}/validate`, {
        message: xmlString,
        messageType: messageType
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        valid: response.data.valid,
        errors: response.data.errors || [],
        warnings: response.data.warnings || []
      };
    } catch (error) {
      logger.warn('SWIFT validation service unavailable:', error.message);
      return {
        valid: null,
        errors: ['SWIFT validation service unavailable'],
        warnings: []
      };
    }
  }

  addKYCAMLFields(mappedData, kycData = null) {
    if (!kycData) return mappedData;

    // Add KYC/AML specific fields
    mappedData.regulatoryReporting = {
      authority: kycData.authority || 'LOCAL',
      details: kycData.details || {}
    };

    mappedData.debtor.dateOfBirth = kycData.debtorDOB;
    mappedData.debtor.countryOfResidence = kycData.debtorCountry;
    mappedData.creditor.dateOfBirth = kycData.creditorDOB;
    mappedData.creditor.countryOfResidence = kycData.creditorCountry;

    return mappedData;
  }
}

module.exports = ValidationService;