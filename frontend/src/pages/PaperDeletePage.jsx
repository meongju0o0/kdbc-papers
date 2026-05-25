import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import PageTitle from '../components/PageTitle';
import Pagination from '../components/Pagination';

const ITEMS_PER_PAGE = 10;

export default function PaperDeletePage() {
  const [issues, setIssues] = useState([]);
  const [papers, setPapers] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState('');
  const [selectedNo, setSelectedNo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedVolume, setAppliedVolume] = useState('');
  const [appliedNo, setAppliedNo] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [error, setError] = useState('');
  const [papersError, setPapersError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    async function fetchIssues() {
      try {
        const issueData = await api.getPaperIssues();
        setIssues(issueData);
      } catch {
        setError('데이터를 불러오지 못했습니다.');
      } finally {
        setLoadingIssues(false);
      }
    }

    fetchIssues();
  }, []);

  useEffect(() => {
    async function fetchPapers() {
      try {
        setPapersError('');
        setLoadingPapers(true);
        const response = await api.getPapers({
          volume: appliedVolume || undefined,
          no: appliedNo || undefined,
          includePdf: false,
          page: currentPage,
          pageSize: ITEMS_PER_PAGE,
          keyword: appliedSearchQuery,
        });

        setPapers(response.items || []);
        setTotalPages(response.pagination?.totalPages || 1);
        if (response.pagination?.page && response.pagination.page !== currentPage) {
          setCurrentPage(response.pagination.page);
        }
      } catch {
        setPapersError('논문 목록을 불러오지 못했습니다.');
      } finally {
        setLoadingPapers(false);
      }
    }

    fetchPapers();
  }, [appliedVolume, appliedNo, appliedSearchQuery, currentPage, reloadToken]);

  const volumeOptions = useMemo(
    () => [...new Set(issues.map((issue) => String(issue.volume)))],
    [issues]
  );

  const noOptions = useMemo(
    () => issues
      .filter((issue) => String(issue.volume) === selectedVolume)
      .map((issue) => String(issue.issue_no)),
    [issues, selectedVolume]
  );

  function handleSearchApply() {
    if (!selectedVolume && selectedNo) {
      setPapersError('Volume과 No.는 함께 선택해 주세요.');
      return;
    }

    setPapersError('');
    setAppliedVolume(selectedVolume);
    setAppliedNo(selectedNo);
    setAppliedSearchQuery(searchQuery);
    setCurrentPage(1);
  }

  function formatAuthors(authorsText) {
    if (!authorsText) return '-';

    const authors = authorsText
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (authors.length <= 1) {
      return authors[0] || '-';
    }

    return `${authors[0]} 외 ${authors.length - 1}명`;
  }

  async function handleDelete(paper) {
    const shouldDelete = window.confirm(`정말 삭제하시겠습니까?\n\n${paper.title}`);
    if (!shouldDelete) return;

    try {
      setPapersError('');
      setDeletingId(paper.id);
      await api.deletePaper(paper.id);
      if (papers.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else {
        setReloadToken((prev) => prev + 1);
      }
    } catch (requestError) {
      setPapersError(requestError.message || '논문 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section>
      <PageTitle
        title="논문 삭제"
        subtitle="메인 페이지와 동일한 방식으로 검색 후 논문을 선택해 삭제할 수 있습니다."
      />

      {loadingIssues ? (
        <p className="status-text">불러오는 중...</p>
      ) : error ? (
        <p className="status-text error">{error}</p>
      ) : (
        <div className="issue-selector-card">
          <div className="issue-selector-grid">
            <label className="issue-selector-label">
              Volume
              <select className="issue-selector-select" value={selectedVolume} onChange={(event) => {
                setSelectedVolume(event.target.value);
                setSelectedNo('');
              }}>
                <option value="">전체</option>
                {volumeOptions.map((volume) => (
                  <option key={volume} value={volume}>{volume}</option>
                ))}
              </select>
            </label>

            <label className="issue-selector-label">
              No.
              <select className="issue-selector-select" value={selectedNo} onChange={(event) => setSelectedNo(event.target.value)}>
                <option value="">전체</option>
                {noOptions.map((no) => (
                  <option key={no} value={no}>{no}</option>
                ))}
              </select>
            </label>
          </div>

          <form className="issue-search-form" onSubmit={(event) => {
            event.preventDefault();
            handleSearchApply();
          }}>
            <label className="issue-search-box">
              논문 검색
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="제목, 저자, 소속으로 검색"
              />
            </label>
            <button type="submit" className="primary-button issue-search-button">검색</button>
          </form>

          {loadingPapers ? (
            <p className="status-text">논문 목록을 불러오는 중...</p>
          ) : papersError ? (
            <p className="status-text error">{papersError}</p>
          ) : papers.length === 0 ? (
            <p className="status-text">검색 결과가 없습니다.</p>
          ) : (
            <>
              <div className="table-wrapper issue-table-wrapper">
                <table className="board-table">
                  <thead>
                    <tr>
                      <th>제목</th>
                      <th>저자</th>
                      <th>소속</th>
                      <th>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((paper) => (
                      <tr key={paper.id}>
                        <td>{paper.title}</td>
                        <td>{formatAuthors(paper.authors)}</td>
                        <td>{paper.affiliation}</td>
                        <td>
                          <button
                            type="button"
                            className="danger-text-button"
                            disabled={deletingId === paper.id}
                            onClick={() => handleDelete(paper)}
                          >
                            {deletingId === paper.id ? '삭제 중...' : '삭제'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
