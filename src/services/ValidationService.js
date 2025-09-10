const axios = require('axios');
const { parseString } = require('xml2js');
const { DOMParser } = require('@xmldom/xmldom');

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
      
      // Enhanced validation instead of SWIFT
      const enhancedResults = await this.validateWithEnhancedRules(xmlString, messageType);
      results.swiftValidation = enhancedResults;
  
      if (!enhancedResults.valid) {
        results.isValid = false;
        results.errors.push(...enhancedResults.errors);
        results.warnings.push(...enhancedResults.warnings);
      }
  
      console.info(`XML validation completed for ${messageType}`);
      return results;
    } catch (error) {
      results.isValid = false;
      results.errors.push(error.message);
      console.error('XML validation failed:', error);
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

  async validateWithEnhancedRules(xmlString, messageType) {
    const errors = [];
    const warnings = [];
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'application/xml');
      
      // Check for required elements based on message type
      const requiredElements = this.getRequiredElements(messageType);
      
      for (const element of requiredElements) {
        if (!doc.getElementsByTagName(element).length) {
          errors.push(`Missing required element: ${element}`);
        }
      }
      
      // Validate BIC codes
      const bicElements = doc.getElementsByTagName('BIC');
      for (let i = 0; i < bicElements.length; i++) {
        const bic = bicElements[i].textContent;
        if (!this.isValidBIC(bic)) {
          errors.push(`Invalid BIC format: ${bic}`);
        }
      }
      
      // Validate amounts
      const amountElements = doc.getElementsByTagName('InstdAmt');
      for (let i = 0; i < amountElements.length; i++) {
        const amount = amountElements[i].textContent;
        if (!this.isValidAmount(amount)) {
          errors.push(`Invalid amount format: ${amount}`);
        }
      }
      
      return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Enhanced validation failed: ${error.message}`],
        warnings: []
      };
    }
  }
  
  getRequiredElements(messageType) {
    const elementMap = {
      'pacs.008': ['GrpHdr', 'CdtTrfTxInf', 'IntrBkSttlmAmt'],
      'pain.001': ['GrpHdr', 'PmtInf', 'CdtTrfTxInf']
    };
    return elementMap[messageType] || [];
  }
  
  isValidBIC(bic) {
    const bicRegex = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
    return bicRegex.test(bic);
  }
  
  isValidAmount(amount) {
    const amountRegex = /^\d+(\.\d{1,5})?$/;
    return amountRegex.test(amount);
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