import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function PaperCreatePage() {
  const navigate = useNavigate();
  const [vol, setVol] = useState('');
  const [no, setNo] = useState('');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [abstractedText, setAbstractedText] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  function normalizeAbstractText(text) {
    return text.replace(/[\r\n]+/g, ' ');
  }

  function isPdfFile(file) {
    if (!file) return false;
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  function handlePdfSelect(file) {
    if (!file) {
      setPdfFile(null);
      return;
    }

    if (!isPdfFile(file)) {
      setError('PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    setError('');
    setPdfFile(file);
  }

  function handleFileInputChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    handlePdfSelect(selectedFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    const droppedFile = event.dataTransfer.files?.[0] || null;
    handlePdfSelect(droppedFile);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!title || !vol || !no || !authors || !affiliation) {
      setError('제목, Volume, No, 저자, 소속은 필수입니다.');
      return;
    }

    if (pdfFile && !isPdfFile(pdfFile)) {
      setError('PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    try {
      setError('');
      setLoading(true);

      const formData = new FormData();
      formData.append('title', title);
      formData.append('vol', String(Number(vol)));
      formData.append('no', String(Number(no)));
      formData.append('authors', authors);
      formData.append('affiliation', affiliation);
      formData.append('abstracted_text', abstractedText);
      if (pdfFile) {
        formData.append('pdf', pdfFile);
      }

      const created = await api.createPaper(formData);

      navigate(`/paper/${created.id}`);
    } catch (requestError) {
      setError(requestError.message || '논문 추가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="paper-create-page">
      <div className="paper-create-card">
        <h1>논문 추가</h1>
        <p>로그인한 사용자만 논문을 등록할 수 있습니다.</p>

        <form className="paper-create-form" onSubmit={handleSubmit}>
          <label>
            Volume
            <input
              type="number"
              min="1"
              value={vol}
              onChange={(event) => setVol(event.target.value)}
              placeholder="예: 12"
            />
          </label>

          <label>
            No.
            <input
              type="number"
              min="1"
              value={no}
              onChange={(event) => setNo(event.target.value)}
              placeholder="예: 2"
            />
          </label>

          <label className="full-width-field">
            제목
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="논문 제목을 입력하세요"
            />
          </label>

          <label>
            저자
            <input
              type="text"
              value={authors}
              onChange={(event) => setAuthors(event.target.value)}
              placeholder="예: 홍길동, 김영희"
            />
          </label>

          <label>
            소속
            <input
              type="text"
              value={affiliation}
              onChange={(event) => setAffiliation(event.target.value)}
              placeholder="예: 경희대학교 컴퓨터공학부"
            />
          </label>

          <label className="full-width-field">
            초록
            <textarea
              value={abstractedText}
              onChange={(event) => setAbstractedText(normalizeAbstractText(event.target.value))}
              placeholder="초록 내용을 입력하세요"
              rows={6}
            />
          </label>

          <label className="full-width-field">
            PDF 파일
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden-file-input"
              onChange={handleFileInputChange}
            />
            <div
              className={`pdf-dropzone${isDragOver ? ' drag-over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <p className="pdf-dropzone-title">PDF 파일을 드래그해서 놓거나 클릭해 선택하세요</p>
              <p className="pdf-dropzone-subtitle">최대 100MB · PDF 형식만 업로드 가능</p>
              <p className="pdf-selected-name">{pdfFile ? pdfFile.name : '선택된 파일 없음'}</p>
            </div>
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? '등록 중...' : '논문 등록'}
          </button>
        </form>
      </div>
    </section>
  );
}
