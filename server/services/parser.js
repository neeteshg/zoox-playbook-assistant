import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parse a file into sections based on file type
 * @param {string} filePath - Path to uploaded file
 * @param {string} originalName - Original file name
 * @param {string[]} defaultTags - Tags to apply to all sections
 * @returns {Promise<{doc_title: string, sections: Array}>}
 */
export async function parseFile(filePath, originalName, defaultTags = []) {
  const ext = path.extname(originalName).toLowerCase();
  const content = fs.readFileSync(filePath);

  switch (ext) {
    case '.pdf':
      return parsePDF(content, originalName, defaultTags);
    case '.docx':
      return parseDOCX(content, originalName, defaultTags);
    case '.txt':
    case '.md':
      return parseMarkdown(content.toString('utf-8'), originalName, defaultTags);
    case '.csv':
      return parseCSV(content.toString('utf-8'), originalName, defaultTags);
    case '.xlsx':
      return parseXLSX(content, originalName, defaultTags);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function parsePDF(buffer, originalName, defaultTags) {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const text = data.text;
  return splitIntoSections(text, originalName, defaultTags);
}

async function parseDOCX(buffer, originalName, defaultTags) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return splitIntoSections(result.value, originalName, defaultTags);
}

function parseMarkdown(text, originalName, defaultTags) {
  return splitIntoSections(text, originalName, defaultTags);
}

function splitIntoSections(text, originalName, defaultTags) {
  const docTitle = path.basename(originalName, path.extname(originalName))
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  // Split by headings (markdown-style or ALL-CAPS lines)
  const headingPattern = /^(#{1,3}\s+.+|[A-Z][A-Z\s]{5,}(?:\n|$))/gm;
  const parts = text.split(headingPattern);

  const sections = [];
  let currentTitle = 'Introduction';
  let currentText = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check if this part is a heading
    if (/^#{1,3}\s+/.test(trimmed) || /^[A-Z][A-Z\s]{5,}$/.test(trimmed)) {
      // Save previous section
      if (currentText.trim()) {
        sections.push({
          section_title: currentTitle,
          section_text: currentText.trim(),
        });
      }
      currentTitle = trimmed.replace(/^#+\s*/, '').trim();
      currentText = '';
    } else {
      currentText += (currentText ? '\n' : '') + trimmed;
    }
  }

  // Save last section
  if (currentText.trim()) {
    sections.push({
      section_title: currentTitle,
      section_text: currentText.trim(),
    });
  }

  // If no sections were created, make the whole text one section
  if (sections.length === 0 && text.trim()) {
    sections.push({
      section_title: docTitle,
      section_text: text.trim(),
    });
  }

  return {
    doc_title: docTitle,
    sections: sections.map((s, i) => ({
      section_id: `sec_${uuidv4().substring(0, 8)}`,
      section_title: s.section_title,
      section_text: s.section_text,
      tags: defaultTags,
    }))
  };
}

function parseCSV(text, originalName, defaultTags) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) {
    return { doc_title: originalName, sections: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const docTitle = path.basename(originalName, path.extname(originalName))
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  // Try to find relevant columns
  const scenarioCol = headers.findIndex(h => ['scenario', 'title', 'question', 'topic', 'section_title'].includes(h));
  const stepsCol = headers.findIndex(h => ['steps', 'content', 'answer', 'procedure', 'section_text', 'text'].includes(h));
  const tagsCol = headers.findIndex(h => ['tags', 'category', 'categories'].includes(h));

  const sections = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;

    const title = scenarioCol >= 0 ? cols[scenarioCol] : cols[0];
    const text = stepsCol >= 0 ? cols[stepsCol] : cols.slice(1).join(' ');
    const rowTags = tagsCol >= 0 ? cols[tagsCol].split(/[;|]/).map(t => t.trim()).filter(t => t) : [];

    sections.push({
      section_id: `sec_${uuidv4().substring(0, 8)}`,
      section_title: title.replace(/"/g, ''),
      section_text: text.replace(/"/g, ''),
      tags: [...defaultTags, ...rowTags],
    });
  }

  return { doc_title: docTitle, sections };
}

async function parseXLSX(buffer, originalName, defaultTags) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet);
  return parseCSV(csv, originalName, defaultTags);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
