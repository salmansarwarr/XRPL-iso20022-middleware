const { create } = require('xmlbuilder2');

class XMLGenerator {
  constructor() {
    this.namespaces = {
      'xmlns': 'urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
    };
  }

  generatePacs008XML(mappedData) {
    try {
      const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('Document', this.namespaces)
        .ele('FIToFICstmrCdtTrf');

      // Group Header
      const grpHdr = doc.ele('GrpHdr');
      grpHdr.ele('MsgId').txt(mappedData.messageId);
      grpHdr.ele('CreDtTm').txt(mappedData.creationDateTime);
      grpHdr.ele('NbOfTxs').txt(mappedData.numberOfTransactions);
      grpHdr.ele('CtrlSum').txt(mappedData.controlSum);

      // Instructing Agent
      const instgAgt = grpHdr.ele('InstgAgt');
      instgAgt.ele('FinInstnId').ele('Othr').ele('Id').txt('HCTMIDDLEWARE');

      // Instructed Agent
      const instdAgt = grpHdr.ele('InstdAgt');
      instdAgt.ele('FinInstnId').ele('Othr').ele('Id').txt('XRPLEDGER');

      // Credit Transfer Transaction Information
      const cdtTrfTxInf = doc.ele('CdtTrfTxInf');
      
      // Payment Identification
      const pmtId = cdtTrfTxInf.ele('PmtId');
      pmtId.ele('InstrId').txt(mappedData.instructionId);
      pmtId.ele('EndToEndId').txt(mappedData.endToEndId);
      pmtId.ele('TxId').txt(mappedData.transactionId);

      // Interbank Settlement Amount
      const intrBkSttlmAmt = cdtTrfTxInf.ele('IntrBkSttlmAmt');
      intrBkSttlmAmt.att('Ccy', mappedData.instructedAmount.currency);
      intrBkSttlmAmt.txt(mappedData.instructedAmount.value);

      // Charge Bearer
      cdtTrfTxInf.ele('ChrgBr').txt(mappedData.chargeBearer);

      // Debtor
      const dbtr = cdtTrfTxInf.ele('Dbtr');
      dbtr.ele('Nm').txt(mappedData.debtor.name);
      dbtr.ele('Id').ele('OrgId').ele('Othr').ele('Id').txt(mappedData.debtor.identification);

      // Debtor Account
      const dbtrAcct = cdtTrfTxInf.ele('DbtrAcct');
      dbtrAcct.ele('Id').ele('Othr').ele('Id').txt(mappedData.debtorAccount.identification);

      // Creditor
      const cdtr = cdtTrfTxInf.ele('Cdtr');
      cdtr.ele('Nm').txt(mappedData.creditor.name);
      cdtr.ele('Id').ele('OrgId').ele('Othr').ele('Id').txt(mappedData.creditor.identification);

      // Creditor Account
      const cdtrAcct = cdtTrfTxInf.ele('CdtrAcct');
      cdtrAcct.ele('Id').ele('Othr').ele('Id').txt(mappedData.creditorAccount.identification);

      // Remittance Information
      if (mappedData.remittanceInformation) {
        const rmtInf = cdtTrfTxInf.ele('RmtInf');
        rmtInf.ele('Ustrd').txt(mappedData.remittanceInformation.unstructured);
      }

      // Purpose Code
      if (mappedData.purposeCode) {
        cdtTrfTxInf.ele('Purp').ele('Cd').txt(mappedData.purposeCode);
      }

      const xmlString = doc.end({ prettyPrint: true });
      console.info('Generated ISO 20022 pacs.008 XML');
      return xmlString;
    } catch (error) {
      console.error('Error generating XML:', error);
      throw error;
    }
  }

  generatePain001XML(mappedData) {
    try {
      const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('Document', {
          'xmlns': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
        })
        .ele('CstmrCdtTrfInitn');

      // Group Header
      const grpHdr = doc.ele('GrpHdr');
      grpHdr.ele('MsgId').txt(mappedData.messageId);
      grpHdr.ele('CreDtTm').txt(mappedData.creationDateTime);
      grpHdr.ele('NbOfTxs').txt(mappedData.numberOfTransactions);
      grpHdr.ele('CtrlSum').txt(mappedData.controlSum);

      // Initiating Party
      const initgPty = grpHdr.ele('InitgPty');
      initgPty.ele('Nm').txt('Hoodie Chicken Middleware');
      initgPty.ele('Id').ele('OrgId').ele('Othr').ele('Id').txt('HCT_MIDDLEWARE');

      // Payment Information
      const pmtInf = doc.ele('PmtInf');
      pmtInf.ele('PmtInfId').txt(mappedData.messageId);
      pmtInf.ele('PmtMtd').txt('TRF');
      pmtInf.ele('NbOfTxs').txt(mappedData.numberOfTransactions);
      pmtInf.ele('CtrlSum').txt(mappedData.controlSum);

      // Debtor
      const dbtr = pmtInf.ele('Dbtr');
      dbtr.ele('Nm').txt(mappedData.debtor.name);
      dbtr.ele('Id').ele('OrgId').ele('Othr').ele('Id').txt(mappedData.debtor.identification);

      // Debtor Account
      const dbtrAcct = pmtInf.ele('DbtrAcct');
      dbtrAcct.ele('Id').ele('Othr').ele('Id').txt(mappedData.debtorAccount.identification);

      // Credit Transfer Transaction Information
      const cdtTrfTxInf = pmtInf.ele('CdtTrfTxInf');
      
      const pmtId = cdtTrfTxInf.ele('PmtId');
      pmtId.ele('EndToEndId').txt(mappedData.endToEndId);

      const amt = cdtTrfTxInf.ele('Amt').ele('InstdAmt');
      amt.att('Ccy', mappedData.instructedAmount.currency);
      amt.txt(mappedData.instructedAmount.value);

      const cdtr = cdtTrfTxInf.ele('Cdtr');
      cdtr.ele('Nm').txt(mappedData.creditor.name);

      const cdtrAcct = cdtTrfTxInf.ele('CdtrAcct');
      cdtrAcct.ele('Id').ele('Othr').ele('Id').txt(mappedData.creditorAccount.identification);

      if (mappedData.remittanceInformation) {
        const rmtInf = cdtTrfTxInf.ele('RmtInf');
        rmtInf.ele('Ustrd').txt(mappedData.remittanceInformation.unstructured);
      }

      const xmlString = doc.end({ prettyPrint: true });
      console.info('Generated ISO 20022 pain.001 XML');
      return xmlString;
    } catch (error) {
      console.error('Error generating pain.001 XML:', error);
      throw error;
    }
  }
}

module.exports = XMLGenerator;