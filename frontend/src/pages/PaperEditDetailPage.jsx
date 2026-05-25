import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';

export default function PaperEditDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pdfFile, setPdfFile] = useState(null);

  const [formValues, setFormValues] = useState({
    title: '',
    vol: '',
    no: '',
    authors: '',
    affiliation: '',
    abstracted_text: '',
  });

  useEffect(() => {
    async function fetchPaper() {
      try {
        setError('');
        setLoading(true);
        const paper = await api.getPaper(id);
        setFormValues({
          title: paper.title || '',
          vol: String(paper.vol ?? paper.volume ?? ''),
          no: String(paper.no ?? paper.issue_no ?? ''),
          authors: paper.authors || '',
          affiliation: paper.affiliation || '',
          abstracted_text: paper.abstract_text || '',
        });
      } catch (requestError) {
        setError(requestError.message || '논문 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }

    fetchPaper();
  }, [id]);

  function normalizeAbstractText(text) {
    return text.replace(/[\r\n]+/g, ' ');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formValues.title || !formValues.vol || !formValues.no || !formValues.authors || !formValues.affiliation) {
      setError('제목, Volume, No, 저자, 소속은 필수입니다.');
      return;
    }

    try {
      setError('');
      setSaving(true);

      const formData = new FormData();
      formData.append('title', formValues.title);
      formData.append('vol', String(Number(formValues.vol)));
      formData.append('no', String(Number(formValues.no)));
      formData.append('authors', formValues.authors);
      formData.append('affiliation', formValues.affiliation);
      formData.append('abstracted_text', formValues.abstracted_text);
      if (pdfFile) formData.append('pdf', pdfFile);

      await api.updatePaper(id, formData);
      navigate('/papers/edit');
    } catch (requestError) {
      setError(requestError.message || '논문 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="paper-create-page">
      {loading ? (
        <p className="status-text">불러오는 중...</p>
      ) : error ? (
        <p className="status-text error">{error}</p>
      ) : (
        <div className="paper-create-card">
          <h1>선택 논문 수정</h1>
          <p>논문 정보를 수정한 뒤 저장하면 논문 수정 목록 페이지로 돌아갑니다.</p>
          <form className="paper-create-form" onSubmit={handleSubmit}>
            <label className="full-width-field">
              제목
              <input
                type="text"
                value={formValues.title}
                onChange={(event) => setFormValues((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>

            <label>
              Volume
              <input
                type="number"
                min="1"
                value={formValues.vol}
                onChange={(event) => setFormValues((prev) => ({ ...prev, vol: event.target.value }))}
              />
            </label>

            <label>
              No.
              <input
                type="number"
                min="1"
                value={formValues.no}
                onChange={(event) => setFormValues((prev) => ({ ...prev, no: event.target.value }))}
              />
            </label>

            <label>
              저자
              <input
                type="text"
                value={formValues.authors}
                onChange={(event) => setFormValues((prev) => ({ ...prev, authors: event.target.value }))}
              />
            </label>

            <label>
              소속
              <input
                type="text"
                value={formValues.affiliation}
                onChange={(event) => setFormValues((prev) => ({ ...prev, affiliation: event.target.value }))}
              />
            </label>

            <label className="full-width-field">
              초록
              <textarea
                value={formValues.abstracted_text}
                rows={6}
                onChange={(event) => setFormValues((prev) => ({
                  ...prev,
                  abstracted_text: normalizeAbstractText(event.target.value),
                }))}
              />
            </label>

            <label className="full-width-field">
              PDF 파일 (선택 시 교체)
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden-file-input"
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              />
              <div className="pdf-dropzone" onClick={() => fileInputRef.current?.click()}>
                <p className="pdf-dropzone-title">클릭해 PDF를 선택하세요</p>
                <p className="pdf-selected-name">{pdfFile ? pdfFile.name : '기존 PDF 유지'}</p>
              </div>
            </label>

            <div className="paper-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate('/papers/edit')}
                disabled={saving}
              >
                목록으로
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? '수정 중...' : '논문 수정 저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
