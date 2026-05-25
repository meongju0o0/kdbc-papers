import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');

export async function createPaper(req, res) {
  try {
    const { title, vol, no, authors, affiliation, abstracted_text } = req.body;
    const pdfUrl = req.file ? `/uploads/papers/${req.file.filename}` : null;
    const normalizedAbstractText = typeof abstracted_text === 'string'
      ? abstracted_text.replace(/[\r\n]+/g, ' ')
      : null;

    if (!title || !vol || !no || !authors || !affiliation) {
      return res.status(400).json({ message: 'title, vol, no, authors, affiliation은 필수입니다.' });
    }

    const volume = Number(vol);
    const issueNo = Number(no);

    if (Number.isNaN(volume) || Number.isNaN(issueNo)) {
      return res.status(400).json({ message: 'vol, no는 숫자여야 합니다.' });
    }

    const [issueRows] = await pool.query(
      `
      SELECT id
      FROM paper_issues
      WHERE vol = ? AND no = ?
      LIMIT 1
      `,
      [volume, issueNo]
    );

    if (issueRows.length === 0) {
      return res.status(400).json({ message: '먼저 권(호) 관리에서 해당 Volume/No를 생성해 주세요.' });
    }

    const [result] = await pool.query(
      `
      INSERT INTO papers (title, vol, no, authors, affiliation, abstracted_text, pdf_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [title, volume, issueNo, authors, affiliation, normalizedAbstractText || null, pdfUrl]
    );

    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('createPaper error:', error);
    return res.status(500).json({ message: 'Failed to create paper.' });
  }
}

export async function getAllPapers(req, res) {
  try {
    const requestedVol = req.query.vol ?? req.query.volume;
    const requestedNo = req.query.no;
    const rawPage = Number.parseInt(req.query.page ?? '1', 10);
    const rawPageSize = Number.parseInt(req.query.pageSize ?? '10', 10);
    const requestedKeyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const includePdf = req.query.includePdf !== 'false';
    const hasKeyword = requestedKeyword.length > 0;
    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const pageSize = Number.isNaN(rawPageSize) || rawPageSize < 1
      ? 10
      : Math.min(rawPageSize, 100);

    const selectColumns = includePdf
      ? 'id, title, authors, affiliation, pdf_url'
      : 'id, title, authors, affiliation';

    const whereClauses = [];
    const whereParams = [];

    if (requestedVol) {
      whereClauses.push('vol = ?');
      whereParams.push(Number(requestedVol));
    }

    if (requestedNo) {
      whereClauses.push('no = ?');
      whereParams.push(Number(requestedNo));
    }

    if (hasKeyword) {
      whereClauses.push('(title LIKE ? OR authors LIKE ? OR affiliation LIKE ?)');
      const keywordParam = `%${requestedKeyword}%`;
      whereParams.push(keywordParam, keywordParam, keywordParam);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM papers
      ${whereSql}
      `,
      whereParams
    );

    const total = countRows[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const offset = (effectivePage - 1) * pageSize;

    const sql = `
      SELECT ${selectColumns}
      FROM papers
      ${whereSql}
      ORDER BY vol DESC, no DESC, title ASC, id DESC
      LIMIT ? OFFSET ?
      `;

    const params = [...whereParams, pageSize, offset];
    const [rows] = await pool.query(
      sql,
      params
    );

    res.json({
      items: rows,
      pagination: {
        page: effectivePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('getAllPapers error:', error);
    res.status(500).json({ message: 'Failed to fetch papers.' });
  }
}

export async function getPaperById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT id, title, authors, affiliation, pdf_url,
         vol AS volume, no AS issue_no,
         abstracted_text AS abstract_text
      FROM papers
      WHERE id = ?
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Paper not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('getPaperById error:', error);
    res.status(500).json({ message: 'Failed to fetch paper.' });
  }
}

export async function getPaperIssues(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT vol AS volume, no AS issue_no, publish_year, publish_month
      FROM paper_issues
      ORDER BY vol DESC, no DESC
      `
    );

    res.json(rows);
  } catch (error) {
    console.error('getPaperIssues error:', error);
    res.status(500).json({ message: 'Failed to fetch paper issues.' });
  }
}

export async function deletePaper(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT id, pdf_url
      FROM papers
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: '삭제할 논문을 찾을 수 없습니다.' });
    }

    const paper = rows[0];

    await pool.query(
      `
      DELETE FROM papers
      WHERE id = ?
      `,
      [id]
    );

    if (paper.pdf_url && paper.pdf_url.startsWith('/uploads/')) {
      const relativePath = paper.pdf_url.replace('/uploads/', '');
      const targetPath = path.resolve(uploadsRoot, relativePath);

      if (targetPath.startsWith(uploadsRoot)) {
        try {
          await fs.unlink(targetPath);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn('pdf file delete warning:', error.message);
          }
        }
      }
    }

    return res.json({ message: '논문이 삭제되었습니다.', id: Number(id) });
  } catch (error) {
    console.error('deletePaper error:', error);
    return res.status(500).json({ message: 'Failed to delete paper.' });
  }
}

export async function updatePaper(req, res) {
  try {
    const { id } = req.params;
    const { title, vol, no, authors, affiliation, abstracted_text } = req.body;

    if (!title || !vol || !no || !authors || !affiliation) {
      return res.status(400).json({ message: 'title, vol, no, authors, affiliation은 필수입니다.' });
    }

    const volume = Number(vol);
    const issueNo = Number(no);
    if (Number.isNaN(volume) || Number.isNaN(issueNo)) {
      return res.status(400).json({ message: 'vol, no는 숫자여야 합니다.' });
    }

    const [issueRows] = await pool.query(
      `
      SELECT id
      FROM paper_issues
      WHERE vol = ? AND no = ?
      LIMIT 1
      `,
      [volume, issueNo]
    );

    if (issueRows.length === 0) {
      return res.status(400).json({ message: '먼저 권(호) 관리에서 해당 Volume/No를 생성해 주세요.' });
    }

    const normalizedAbstractText = typeof abstracted_text === 'string'
      ? abstracted_text.replace(/[\r\n]+/g, ' ')
      : null;

    const [existingRows] = await pool.query(
      `
      SELECT id, pdf_url
      FROM papers
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: '수정할 논문을 찾을 수 없습니다.' });
    }

    const existing = existingRows[0];
    const nextPdfUrl = req.file ? `/uploads/papers/${req.file.filename}` : existing.pdf_url;

    await pool.query(
      `
      UPDATE papers
      SET title = ?,
          vol = ?,
          no = ?,
          authors = ?,
          affiliation = ?,
          abstracted_text = ?,
          pdf_url = ?
      WHERE id = ?
      `,
      [title, volume, issueNo, authors, affiliation, normalizedAbstractText || null, nextPdfUrl, id]
    );

    if (req.file && existing.pdf_url && existing.pdf_url.startsWith('/uploads/')) {
      const relativePath = existing.pdf_url.replace('/uploads/', '');
      const targetPath = path.resolve(uploadsRoot, relativePath);

      if (targetPath.startsWith(uploadsRoot)) {
        try {
          await fs.unlink(targetPath);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn('old pdf delete warning:', error.message);
          }
        }
      }
    }

    return res.json({ message: '논문이 수정되었습니다.', id: Number(id) });
  } catch (error) {
    console.error('updatePaper error:', error);
    return res.status(500).json({ message: 'Failed to update paper.' });
  }
}
