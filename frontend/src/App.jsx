import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import PaperDetailPage from './pages/PaperDetailPage';
import LoginPage from './pages/LoginPage';
import PaperCreatePage from './pages/PaperCreatePage';
import PaperDeletePage from './pages/PaperDeletePage';
import PaperEditPage from './pages/PaperEditPage';
import PaperEditDetailPage from './pages/PaperEditDetailPage';
import IssueManagePage from './pages/IssueManagePage';
import ProtectedRoute from './components/ProtectedRoute';


export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/papers/new"
            element={(
              <ProtectedRoute>
                <PaperCreatePage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/papers/edit"
            element={(
              <ProtectedRoute>
                <PaperEditPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/papers/edit/:id"
            element={(
              <ProtectedRoute>
                <PaperEditDetailPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/papers/delete"
            element={(
              <ProtectedRoute>
                <PaperDeletePage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/issues/manage"
            element={(
              <ProtectedRoute>
                <IssueManagePage />
              </ProtectedRoute>
            )}
          />
          <Route path="/paper/:id" element={<PaperDetailPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <p>Copyright (c) {new Date().getFullYear()} KIISE Database Society of Korea. All rights reserved.</p>
          <p>Created by Juyeong Shin, Taeyeon Kim & Young-Koo Lee</p>
          <p>Licensed under MIT License</p>
        </div>
      </footer>
    </div>
  );
}
