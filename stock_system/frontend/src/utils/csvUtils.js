/**
 * CSV/XLSX Utilities for Order Import
 * Provides functions for parsing CSV and XLSX, validating data, and generating templates
 */

import * as XLSX from 'xlsx';

/**
 * Parse CSV/XLSX file content into array of objects
 * Automatically detects file format based on extension
 * @param {File|string} fileOrText - File object or CSV text content
 * @returns {Promise<object[]>} - Array of parsed objects
 */
export const parseFile = async (fileOrText) => {
  // If it's a File object
  if (fileOrText instanceof File) {
    const fileName = fileOrText.name.toLowerCase();
    
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return parseXLSX(fileOrText);
    } else if (fileName.endsWith('.csv')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const text = e.target.result;
            resolve(parseCSV(text));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(fileOrText);
      });
    } else {
      throw new Error('ต้องเป็นไฟล์ CSV หรือ XLSX เท่านั้น');
    }
  }
  
  // If it's text (CSV)
  return parseCSV(fileOrText);
};

/**
 * Parse XLSX file
 * @param {File} file - XLSX file
 * @returns {Promise<object[]>} - Array of parsed objects
 */
const parseXLSX = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error('ไฟล์ XLSX ไม่มี sheet');
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);
        
        if (rows.length === 0) {
          throw new Error('ไฟล์ XLSX ไม่มีข้อมูล');
        }
        
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Parse CSV text content into array of objects
 * @param {string} csvText - CSV text content
 * @returns {object[]} - Array of parsed objects
 */
const parseCSV = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV ต้องมีอย่างน้อย header row และ 1 data row');

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header.trim().toLowerCase()] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
};

/**
 * Parse a single CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {string[]} - Array of values
 */
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

/**
 * Validate parsed CSV rows against available products
 * @param {object[]} rows - Parsed CSV rows
 * @param {object[]} products - Available products from API
 * @param {string} orderType - 'sale' | 'purchase' | 'adjustment'
 * @returns {{valid: boolean, errors: string[], data: object[]}} - Validation result
 */
export const validateCSVRows = (rows, products, orderType = 'sale') => {
  const errors = [];
  const validatedRows = [];

  if (!rows || rows.length === 0) {
    return { valid: false, errors: ['ไม่มีข้อมูล'], data: [] };
  }

  // Check required columns
  const requiredColumns = ['product name', 'sku', 'quantity', 'unit price'];
  const purchaseColumns = ['batch ref', 'expiry date'];

  const firstRow = rows[0];
  const columnNames = Object.keys(firstRow);

  for (const col of requiredColumns) {
    if (!columnNames.some((c) => c.toLowerCase().includes(col.toLowerCase().split(' ')[0]))) {
      errors.push(`✗ Missing required column: ${col}`);
    }
  }

  if (orderType === 'purchase') {
    // Batch ref and expiry date ไม่บังคับ แต่ให้เตือน
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: [] };
  }

  // Validate each row
  rows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 2; // Row number in CSV (1 for header, start from 2)
    const productName = row['product name'] || '';
    const sku = row['sku'] || '';
    const quantity = row['quantity'] || '';
    const unitPrice = row['unit price'] || '';
    const batchRef = row['batch ref'] || '';
    const expiryDate = row['expiry date'] || '';

    // Required fields - SKU is primary identifier
    if (!sku) {
      errors.push(`Row ${rowNum}: ต้องมี SKU`);
      return;
    }
    if (!quantity || isNaN(quantity) || Number(quantity) <= 0) {
      errors.push(`Row ${rowNum}: Quantity ต้องเป็นตัวเลขที่ > 0`);
      return;
    }
    if (!unitPrice || isNaN(unitPrice) || Number(unitPrice) < 0) {
      errors.push(`Row ${rowNum}: Unit Price ต้องเป็นตัวเลข`);
      return;
    }

    // Find matching variant by SKU (SKU is unique and never changes)
    // Search across all products to find the variant with matching SKU
    let variant = null;
    let product = null;

    for (const prod of products) {
      const foundVariant = prod.variants?.find(
        (v) => v.sku.toLowerCase() === sku.toLowerCase()
      );
      if (foundVariant) {
        variant = foundVariant;
        product = prod;
        break;
      }
    }

    if (!variant || !product) {
      errors.push(`Row ${rowNum}: ไม่พบ SKU "${sku}" ในระบบ`);
      return;
    }

    // Check if variant is active
    if (variant.status === 'inactive') {
      errors.push(`Row ${rowNum}: SKU "${sku}" ถูกปิดใช้งาน`);
      return;
    }

    // Validate expiry date format if provided
    if (expiryDate && orderType === 'purchase') {
      const dateObj = new Date(expiryDate);
      if (isNaN(dateObj.getTime())) {
        errors.push(`Row ${rowNum}: Expiry Date "${expiryDate}" ไม่ถูกต้อง (YYYY-MM-DD)`);
        return;
      }
    }

    // Push validated row
    validatedRows.push({
      productId: product._id,
      variantId: variant._id,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      batchRef: batchRef || '',
      expiryDate: expiryDate || '',
      productName: product.name,
      sku: variant.sku,
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    data: validatedRows,
  };
};

/**
 * Generate CSV template as downloadable file
 * @param {string} orderType - 'sale' | 'purchase' | 'adjustment'
 * @param {object[]} selectedProducts - Selected products with variants (optional)
 */
export const downloadTemplate = (orderType = 'sale', selectedProducts = null) => {
  const typeLabel = {
    sale: 'SO',
    purchase: 'PO',
    adjustment: 'ADJ',
  }[orderType] || 'ORDER';

  let header = 'Product Name,SKU,Quantity,Unit Price';
  const contentLines = [header];

  if (orderType === 'purchase') {
    header = 'Product Name,SKU,Quantity,Unit Price,Batch Ref,Expiry Date';
    contentLines[0] = header;
  }

  // If products are selected, add all their variants as rows
  if (selectedProducts && selectedProducts.length > 0) {
    selectedProducts.forEach((product) => {
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant) => {
          if (variant.status === 'active') {
            let row = `${product.name},${variant.sku},0,${variant.price || 0}`;
            if (orderType === 'purchase') {
              row += ',,';
            }
            contentLines.push(row);
          }
        });
      }
    });
  } else {
    // Default sample rows if no products selected
    let sampleRow = 'Air Max 90,NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER,0,3500';
    if (orderType === 'purchase') {
      sampleRow += ',LOT-2025-001,2027-12-31';
    }
    contentLines.push(sampleRow);
  }

  // Add comment footer
  contentLines.push('');
  contentLines.push('# เขียนหมายเหตุ ไม่ต้องลบแถวนี้');
  contentLines.push(`# ประเภท: ${orderType}`);
  contentLines.push(`# วันที่: ${new Date().toISOString().split('T')[0]}`);
  contentLines.push('');

  const csvContent = contentLines.join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `template_${typeLabel}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export data as CSV file
 * @param {object[]} data - Data to export
 * @param {string[]} columns - Column headers
 * @param {string} filename - Output filename
 */
export const exportToCSV = (data, columns, filename = 'export.csv') => {
  if (!data || data.length === 0) {
    alert('ไม่มีข้อมูลที่จะ export');
    return;
  }

  // Create header
  const header = columns.join(',');

  // Create rows
  const rows = data.map((item) =>
    columns
      .map((col) => {
        const value = item[col] || '';
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      })
      .join(',')
  );

  const csv = [header, ...rows].join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default {
  parseCSV,
  validateCSVRows,
  downloadTemplate,
  exportToCSV,
};
