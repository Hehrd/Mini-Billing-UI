import { useState } from 'react'
import Button from './ui/Button.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import { APP_CONFIG } from '../config/appConfig.js'

function LoginScreen({ error, isLoading, theme, onLogin, onToggleTheme }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onLogin({ username: username.trim(), password })
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">
            MB
          </div>
          <div>
            <p className="eyebrow">{APP_CONFIG.productName}</p>
            <h1 id="login-title">Sign in</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <Button type="submit" disabled={isLoading || !username.trim() || !password}>
            {isLoading ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        <ErrorAlert error={error} />

        <div className="login-footer">
          <span>JWT protected workspace</span>
          <button type="button" className="text-button" onClick={onToggleTheme}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default LoginScreen
