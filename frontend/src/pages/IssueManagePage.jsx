import { useEffect, useState } from 'react';
import PageTitle from '../components/PageTitle';
import { api } from '../api/client';

const initialForm = {
  vol: '',
  no: '',
  publish_year: '',
  publish_month: '',
};

export default function IssueManagePage() {
  const [issues, setIssues] = useState([]);
  const [formValues, setFormValues] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  async function loadIssues() {
    try {
      setError('');
      setLoading(true);
      const data = await api.getIssues();
      setIssues(data);
    } catch (requestError) {
      setError(requestError.message || '권(호) 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIssues();
  }, []);

  function resetForm() {
    setFormValues(initialForm);
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      vol: Number(formValues.vol),
      no: Number(formValues.no),
      publish_year: Number(formValues.publish_year),
      publish_month: Number(formValues.publish_month),
    };

    if ([payload.vol, payload.no, payload.publish_year, payload.publish_month].some((v) => Number.isNaN(v))) {
      setError('모든 필드는 숫자로 입력해 주세요.');
      return;
    }

    try {
      setError('');
      setSaving(true);

      if (editingId) {
        await api.updateIssue(editingId, payload);
      } else {
        await api.createIssue(payload);
      }

      resetForm();
      await loadIssues();
    } catch (requestError) {
      setError(requestError.message || '권(호) 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(issue) {
    setEditingId(issue.id);
    setFormValues({
      vol: String(issue.volume),
      no: String(issue.issue_no),
      publish_year: String(issue.publish_year),
      publish_month: String(issue.publish_month),
    });
  }

  async function handleDelete(issue) {
    const shouldDelete = window.confirm(`삭제하시겠습니까?\nVolume ${issue.volume} / No. ${issue.issue_no}`);
    if (!shouldDelete) return;

    try {
      setError('');
      setDeletingId(issue.id);
      await api.deleteIssue(issue.id);
      if (editingId === issue.id) {
        resetForm();
      }
      await loadIssues();
    } catch (requestError) {
      setError(requestError.message || '권(호) 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section>
      <PageTitle
        title="권(호) 관리"
        subtitle="Volume/No와 발간년/월 정보를 생성, 수정, 삭제할 수 있습니다."
      />

      <div className="issue-manage-layout">
        <div className="paper-create-card issue-manage-card">
          <h2>{editingId ? '권(호) 수정' : '권(호) 생성'}</h2>
          <form className="paper-create-form" onSubmit={handleSubmit}>
            <label>
              Volume
              <input
                type="number"
                min="1"
                value={formValues.vol}
                onChange={(event) => setFormValues((prev) => ({ ...prev, vol: event.target.value }))}
                placeholder="예: 35"
              />
            </label>

            <label>
              No.
              <input
                type="number"
                min="1"
                value={formValues.no}
                onChange={(event) => setFormValues((prev) => ({ ...prev, no: event.target.value }))}
                placeholder="예: 2"
              />
            </label>

            <label>
              발간년
              <input
                type="number"
                min="1900"
                value={formValues.publish_year}
                onChange={(event) => setFormValues((prev) => ({ ...prev, publish_year: event.target.value }))}
                placeholder="예: 2026"
              />
            </label>

            <label>
              발간월
              <input
                type="number"
                min="1"
                max="12"
                value={formValues.publish_month}
                onChange={(event) => setFormValues((prev) => ({ ...prev, publish_month: event.target.value }))}
                placeholder="예: 3"
              />
            </label>

            {error ? <p className="auth-error">{error}</p> : null}

            <div className="paper-form-actions">
              {editingId ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={resetForm}
                >
                  새로 입력
                </button>
              ) : null}
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? '저장 중...' : editingId ? '수정 저장' : '권(호) 생성'}
              </button>
            </div>
          </form>
        </div>

        <div className="issue-selector-card">
          {loading ? (
            <p className="status-text">불러오는 중...</p>
          ) : issues.length === 0 ? (
            <p className="status-text">등록된 권(호)가 없습니다.</p>
          ) : (
            <div className="table-wrapper issue-table-wrapper">
              <table className="board-table compact-table">
                <thead>
                  <tr>
                    <th>Volume</th>
                    <th>No.</th>
                    <th>발간년</th>
                    <th>발간월</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id}>
                      <td>{issue.volume}</td>
                      <td>{issue.issue_no}</td>
                      <td>{issue.publish_year}</td>
                      <td>{issue.publish_month}</td>
                      <td>
                        <div className="issue-manage-actions">
                          <button
                            type="button"
                            className="nav-text-button"
                            onClick={() => handleEdit(issue)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="danger-text-button"
                            disabled={deletingId === issue.id}
                            onClick={() => handleDelete(issue)}
                          >
                            {deletingId === issue.id ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
