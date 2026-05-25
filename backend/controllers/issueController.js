import pool from '../config/db.js';

function parseIssuePayload(body = {}) {
  const volume = Number(body.vol);
  const issueNo = Number(body.no);
  const publishYear = Number(body.publish_year);
  const publishMonth = Number(body.publish_month);

  if ([volume, issueNo, publishYear, publishMonth].some((value) => Number.isNaN(value))) {
    return { error: 'vol, no, publish_year, publish_month는 숫자여야 합니다.' };
  }

  if (volume < 1 || issueNo < 1) {
    return { error: 'vol, no는 1 이상의 숫자여야 합니다.' };
  }

  if (publishMonth < 1 || publishMonth > 12) {
    return { error: 'publish_month는 1~12 범위여야 합니다.' };
  }

  if (publishYear < 1900 || publishYear > 3000) {
    return { error: 'publish_year는 유효한 연도여야 합니다.' };
  }

  return {
    value: {
      vol: volume,
      no: issueNo,
      publish_year: publishYear,
      publish_month: publishMonth,
    },
  };
}

export async function getIssues(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, vol AS volume, no AS issue_no, publish_year, publish_month
      FROM paper_issues
      ORDER BY vol DESC, no DESC
      `
    );

    return res.json(rows);
  } catch (error) {
    console.error('getIssues error:', error);
    return res.status(500).json({ message: '권(호) 목록을 불러오지 못했습니다.' });
  }
}

export async function createIssue(req, res) {
  try {
    const parsed = parseIssuePayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const { vol, no, publish_year, publish_month } = parsed.value;

    const [result] = await pool.query(
      `
      INSERT INTO paper_issues (vol, no, publish_year, publish_month)
      VALUES (?, ?, ?, ?)
      `,
      [vol, no, publish_year, publish_month]
    );

    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY' || error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: '이미 존재하는 권(호)입니다.' });
    }

    console.error('createIssue error:', error);
    return res.status(500).json({ message: '권(호) 생성에 실패했습니다.' });
  }
}

export async function updateIssue(req, res) {
  try {
    const issueId = Number(req.params.id);
    if (Number.isNaN(issueId)) {
      return res.status(400).json({ message: '유효한 권(호) ID가 아닙니다.' });
    }

    const parsed = parseIssuePayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const { vol, no, publish_year, publish_month } = parsed.value;

    const [result] = await pool.query(
      `
      UPDATE paper_issues
      SET vol = ?, no = ?, publish_year = ?, publish_month = ?
      WHERE id = ?
      `,
      [vol, no, publish_year, publish_month, issueId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '수정할 권(호)를 찾을 수 없습니다.' });
    }

    return res.json({ message: '권(호)가 수정되었습니다.', id: issueId });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY' || error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: '이미 존재하는 권(호) 조합입니다.' });
    }

    console.error('updateIssue error:', error);
    return res.status(500).json({ message: '권(호) 수정에 실패했습니다.' });
  }
}

export async function deleteIssue(req, res) {
  try {
    const issueId = Number(req.params.id);
    if (Number.isNaN(issueId)) {
      return res.status(400).json({ message: '유효한 권(호) ID가 아닙니다.' });
    }

    const [rows] = await pool.query(
      `
      SELECT vol, no
      FROM paper_issues
      WHERE id = ?
      LIMIT 1
      `,
      [issueId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: '삭제할 권(호)를 찾을 수 없습니다.' });
    }

    const issue = rows[0];
    const [paperRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM papers
      WHERE vol = ? AND no = ?
      `,
      [issue.vol, issue.no]
    );

    if ((paperRows[0]?.total ?? 0) > 0) {
      return res.status(409).json({ message: '해당 권(호)에 등록된 논문이 있어 삭제할 수 없습니다.' });
    }

    await pool.query(
      `
      DELETE FROM paper_issues
      WHERE id = ?
      `,
      [issueId]
    );

    return res.json({ message: '권(호)가 삭제되었습니다.', id: issueId });
  } catch (error) {
    console.error('deleteIssue error:', error);
    return res.status(500).json({ message: '권(호) 삭제에 실패했습니다.' });
  }
}
