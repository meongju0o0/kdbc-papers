import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api/client';

export default function PaperDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPaper() {
      try {
        const data = await api.getPaper(id);
        setPaper(data);
      } catch (err) {
        setError('논문 상세 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }

    fetchPaper();
  }, [id]);

  if (loading) return <p className="status-text">불러오는 중...</p>;
  if (error) return <p className="status-text error">{error}</p>;
  if (!paper) return null;

  const backPath = location.state?.from || '/';

  return (
    <section className="detail-card">
      <div className="detail-header">
        <span className="detail-badge">논문 상세</span>
        <h1>{paper.title}</h1>
      </div>

      <div className="detail-grid">
        <div><strong>저자</strong><p>{paper.authors}</p></div>
        <div><strong>소속</strong><p>{paper.affiliation}</p></div>
        <div><strong>Volume / No.</strong><p>{paper.volume} / {paper.issue_no}</p></div>
        <div>
          <strong>PDF</strong>
          <p>
            {paper.pdf_url ? (
              <a
                href={`http://163.180.116.100:4000${paper.pdf_url}`}
                target="_blank"
                rel="noreferrer"
                className="table-link"
              >
                PDF 다운로드
              </a>
            ) : '등록된 PDF가 없습니다.'}
          </p>
        </div>
      </div>

      <div className="detail-content">
        <h2>초록</h2>
        <p>{paper.abstract_text || '초록이 등록되지 않았습니다.'}</p>
      </div>

      <Link to={backPath} className="secondary-button inline-button">목록으로</Link>
    </section>
  );
}
