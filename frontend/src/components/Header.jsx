import { NavLink, useNavigate } from 'react-router-dom';
import kdbcLogo from '../assets/KIISE_DB_logo_2.png';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const { isLoggedIn, logout } = useAuth();

  function navigateHomeWithReset() {
    window.dispatchEvent(new Event('kdbc:home-reset'));
    navigate('/', { state: { homeResetAt: Date.now() } });
  }

  function handleLogout() {
    logout();
    navigateHomeWithReset();
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <NavLink
          to="/"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigateHomeWithReset();
          }}
        >
          <img src={kdbcLogo} alt="KDBC 로고" className="brand-logo" />
        </NavLink>

        <nav className="main-nav">
          <NavLink
            to="/"
            onClick={(event) => {
              event.preventDefault();
              navigateHomeWithReset();
            }}
          >
            홈
          </NavLink>
          {isLoggedIn ? (
            <>
              <NavLink to="/issues/manage">권(호) 관리</NavLink>
              <NavLink to="/papers/new">논문 추가</NavLink>
              <NavLink to="/papers/edit">논문 수정</NavLink>
              <NavLink to="/papers/delete">논문 삭제</NavLink>
              <button type="button" className="nav-text-button" onClick={handleLogout}>로그아웃</button>
            </>
          ) : (
            <NavLink to="/login">로그인</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
