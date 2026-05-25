import { Link } from 'react-router-dom';

export default function BoardPreview({ title, items, toPrefix, emptyMessage }) {
  return (
    <section className="board-card">
      <div className="board-card-header">
        <h2>{title}</h2>
      </div>

      {items.length === 0 ? (
        <p className="empty-message">{emptyMessage}</p>
      ) : (
        <ul className="preview-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`${toPrefix}/${item.id}`} className="preview-link-row">
                <span className="preview-link-title">{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
