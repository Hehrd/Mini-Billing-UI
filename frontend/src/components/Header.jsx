import IconButton from './ui/IconButton.jsx'

const MENU_ITEMS = [
  { id: 'workspace', label: 'Workspace', roles: ['USER', 'ADMIN'] },
  { id: 'billing-runs', label: 'Billing runs', roles: ['ADMIN'] },
  { id: 'reports', label: 'Reports', roles: ['ADMIN'] },
  { id: 'audit', label: 'Audit', roles: ['ADMIN'] },
  { id: 'users', label: 'Users', roles: ['ADMIN'] },
]

function Header({ selectedPeriod, theme, user, activeView, onViewChange, onLogout, onToggleTheme }) {
  const menuItems = MENU_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <header className="app-header">
      <nav className="top-nav" aria-label="Main navigation">
        <div className="brand-cluster">
          <div className="brand-mark" aria-hidden="true">
            MB
          </div>
          <div className="nav-copy">
            <h1>Mini Billing</h1>
            <p>Utility invoicing control center</p>
          </div>
        </div>

        <div className="period-chip">
          <span>Selected period</span>
          <strong>{selectedPeriod}</strong>
        </div>

        <div className="shell-actions">
          <div className="role-menu" aria-label="Role based menu">
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === activeView ? 'active' : ''}
                onClick={() => onViewChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="user-pill">
            <span className="status-dot" aria-hidden="true" />
            <p className="user-name">{user.username}</p>
            <strong>{user.role}</strong>
          </div>
          <IconButton label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={onToggleTheme}>
            {theme === 'dark' ? '☀' : '☾'}
          </IconButton>
          <IconButton label="Sign out" onClick={onLogout}>
            ⎋
          </IconButton>
        </div>
      </nav>
    </header>
  )
}

export default Header
