import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import kdbcLogo from '../assets/KIISE_DB_logo_2.png';
import Pagination from '../components/Pagination';

const ITEMS_PER_PAGE = 10;

export default function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Applied filter state derived from URL params — persistent across navigation
  const appliedVolume = searchParams.get('vol') || '';
  const appliedNo = searchParams.get('no') || '';
  const appliedSearchQuery = searchParams.get('q') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const [issues, setIssues] = useState([]);
  const [papers, setPapers] = useState([]);
  // UI state initialized from URL params so sidebar reflects restored state
  const [selectedVolume, setSelectedVolume] = useState(() => searchParams.get('vol') || '');
  const [selectedNo, setSelectedNo] = useState(() => searchParams.get('no') || '');
  const [expandedVolume, setExpandedVolume] = useState(() => searchParams.get('vol') || '');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [totalPages, setTotalPages] = useState(1);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [error, setError] = useState('');
  const [papersError, setPapersError] = useState('');

  function buildParams(vol, no, q, page) {
    const params = {};
    if (vol) params.vol = vol;
    if (no) params.no = no;
    if (q) params.q = q;
    if (page && page > 1) params.page = String(page);
    return params;
  }

  function resetHomeState() {
    setSelectedVolume('');
    setSelectedNo('');
    setExpandedVolume('');
    setSearchQuery('');
    setSearchParams({}, { replace: true });
  }

  useEffect(() => {
    async function fetchData() {
      try {
        const issueData = await api.getPaperIssues();
        setIssues(issueData);
      } catch {
        setError('데이터를 불러오지 못했습니다.');
      } finally {
        setLoadingIssues(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    function handleHomeReset() {
      resetHomeState();
    }

    window.addEventListener('kdbc:home-reset', handleHomeReset);
    return () => {
      window.removeEventListener('kdbc:home-reset', handleHomeReset);
    };
  }, []);

  useEffect(() => {
    const locationSearch = new URLSearchParams(location.search);
    const shouldResetByQuery = locationSearch.has('homeReset');
    const shouldResetByState = Boolean(location.state?.homeResetAt);
    const shouldReset = shouldResetByQuery || shouldResetByState;
    if (!shouldReset) return;

    resetHomeState();

    if (shouldResetByQuery) {
      navigate('/', { replace: true, state: location.state });
    }
  }, [location.search, location.state, navigate]);

  useEffect(() => {
    async function fetchSelectedPapers() {
      try {
        setPapersError('');
        setLoadingPapers(true);
        const hasKeyword = appliedSearchQuery.trim().length > 0;
        const response = await api.getPapers({
          volume: hasKeyword ? undefined : (appliedVolume || undefined),
          no: hasKeyword ? undefined : (appliedNo || undefined),
          page: currentPage,
          pageSize: ITEMS_PER_PAGE,
          keyword: appliedSearchQuery,
        });

        setPapers(response.items || []);
        setTotalPages(response.pagination?.totalPages || 1);
      } catch {
        setPapersError('논문 목록을 불러오지 못했습니다.');
      } finally {
        setLoadingPapers(false);
      }
    }

    fetchSelectedPapers();
  }, [appliedVolume, appliedNo, appliedSearchQuery, currentPage]);

  const volumeOptions = useMemo(
    () => [...new Set(issues.map((issue) => String(issue.volume)))],
    [issues]
  );

  const groupedIssues = useMemo(() => {
    const grouped = {};
    issues.forEach((issue) => {
      const vol = String(issue.volume);
      if (!grouped[vol]) {
        grouped[vol] = [];
      }
      grouped[vol].push(issue);
    });
    Object.keys(grouped).forEach((vol) => {
      grouped[vol].sort((a, b) => Number(b.no) - Number(a.no));
    });
    return grouped;
  }, [issues]);

  const noOptions = useMemo(
    () => issues
      .filter((issue) => String(issue.volume) === selectedVolume)
      .map((issue) => String(issue.issue_no)),
    [issues, selectedVolume]
  );

  const selectedIssue = useMemo(
    () => issues.find(
      (issue) => String(issue.volume) === selectedVolume && String(issue.issue_no) === selectedNo
    ) || null,
    [issues, selectedVolume, selectedNo]
  );

  const selectedIssueDateLabel = useMemo(() => {
    if (!selectedIssue) return '-';

    const year = Number(selectedIssue.publish_year);
    const month = Number(selectedIssue.publish_month);
    if (Number.isNaN(year) || Number.isNaN(month)) return '-';

    return `${year}.${String(month).padStart(2, '0')}`;
  }, [selectedIssue]);

  function handleVolumeGroupClick(volume) {
    if (expandedVolume === volume) {
      setExpandedVolume('');
    } else {
      setExpandedVolume(volume);
    }
  }

  function handleIssueClick(issue) {
    const vol = String(issue.volume);
    const no = String(issue.issue_no);
    setSelectedVolume(vol);
    setSelectedNo(no);
    setSearchQuery('');
    setSearchParams(buildParams(vol, no, '', 1), { replace: true });
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

  function handleSearchApply() {
    const normalized = searchQuery.trim();
    if (!normalized) {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ q: normalized }, { replace: true });
    }
  }

  function handlePageChange(page) {
    setSearchParams(buildParams(appliedVolume, appliedNo, appliedSearchQuery, page), { replace: true });
  }

  return (
    <div className="home-page">
      <section className="hero-section">
        <div>
          <p className="hero-kicker">KIISE Database Society of Korea</p>
          <h1>데이터베이스 연구지 전자 도서관</h1>
          <p className="hero-description">
            DBR(Database Research)에 등록된 논문 목록을 확인할 수 있는 전자 도서관입니다.
          </p>
        </div>
        <div className="hero-info-box">
          <img src={kdbcLogo} alt="KDBC 로고" className="hero-info-logo" />
          <strong>Korea DataBase Conference</strong>
        </div>
      </section>

      {loadingIssues ? (
        <p className="status-text">불러오는 중...</p>
      ) : error ? (
        <p className="status-text error">{error}</p>
      ) : (
        <div className="home-layout-wrapper">
          <aside className="issue-list-sidebar">
            <h3>권호 목록</h3>
            <ul className="issue-list">
              {volumeOptions.map((volume) => (
                <li key={volume}>
                  <button
                    type="button"
                    className="issue-volume-group"
                    onClick={() => handleVolumeGroupClick(volume)}
                  >
                    <span className="issue-volume-label">
                      {expandedVolume === volume ? '▼' : '▶'}
                    </span>
                    <span className="issue-volume-title">Vol.{volume}</span>
                  </button>
                  {expandedVolume === volume && (
                    <ul className="issue-sublist">
                      {groupedIssues[volume]?.map((issue) => (
                        <li key={issue.id}>
                          <button
                            type="button"
                            className={`issue-list-item ${
                              selectedVolume === String(issue.volume) && selectedNo === String(issue.issue_no)
                                ? 'is-active'
                                : ''
                            }`}
                            onClick={() => handleIssueClick(issue)}
                          >
                            <span className="issue-title">No.{issue.issue_no}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </aside>

          <div className="issue-selector-card">
            <div className="issue-search-header">
              <div className="issue-date-box-compact">
                <span>발간일</span>
                <strong>{selectedIssueDateLabel}</strong>
              </div>

              <form
                className="issue-search-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSearchApply();
                }}
              >
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
            </div>

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
                      </tr>
                    </thead>
                    <tbody>
                      {papers.map((paper) => (
                        <tr key={paper.id}>
                          <td>
                            <Link to={`/paper/${paper.id}`} state={{ from: '/' }} className="table-link">
                              {paper.title}
                            </Link>
                          </td>
                          <td>{formatAuthors(paper.authors)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
