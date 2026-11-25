'use strict';
'use client';

import './page.css';
import { useEffect, useState } from 'react';

export default function Login() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginSucceeded, setLoginSucceeded] = useState(false);

  useEffect(() => {
    if (!['invalid', 'no-access'].includes(errorKind)) return undefined;

    const timer = setTimeout(() => {
      setError('');
      setErrorKind('');
    }, 1000);

    return () => clearTimeout(timer);
  }, [errorKind]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) {
      setError('');
      setErrorKind('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorKind('');
    setLoginSucceeded(false);

    const { username, password } = formData;

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      setErrorKind('validation');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError('Invalid credentials');
          setErrorKind('invalid');
        } else if (response.status === 403) {
          setError('You do not have access to log in to this site. Please contact the IT Team.');
          setErrorKind('no-access');
        } else {
          setError('Please contact the IT team.');
          setErrorKind('contact');
        }
        setLoading(false);
        return;
      }

      setLoginSucceeded(true);
      setFormData({ username: '', password: '' });

      const redirectPath = data.redirectPath || '/dashboard';

      setTimeout(() => {
        window.location.assign(redirectPath);
      }, 1000);
    } catch (err) {
      console.error(err);
      setError('Unable to complete authentication. Please contact the IT team.');
      setErrorKind('contact');
      setLoading(false);
    }
  };

  return (
    <div className="loginPage">
      <div className="loginContainer">
        <div className="pageHeader">
          <center>
          <h3 className="brandName">GREENTECH INDUSTRIES</h3>
          <p className="systemName">HOD&apos;s Leave Management System</p>
          </center>
        </div>

        <div style={{ position: 'relative', width: '100%' }}>
          <div className="loginShadowLayer" />
          <div className="loginCard">
            <div className="loginInnerPanel">
              <div className="accentBar" />

              {loginSucceeded ? (
                <div className="loginFeedback loginFeedbackSuccess" role="status" aria-live="polite">
                  <span className="loginFeedbackIcon" aria-hidden="true">✓</span>
                  <h2>Authentication successful</h2>
                  <p>Redirecting...</p>
                </div>
              ) : ['invalid', 'no-access'].includes(errorKind) ? (
                <div className="loginFeedback loginFeedbackError loginFeedbackCenteredError" role="alert" aria-live="assertive">
                  <span className="loginFeedbackIcon" aria-hidden="true">×</span>
                  <p>{error}</p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className={`loginAlert ${errorKind === 'validation' ? 'loginAlertError' : 'loginFeedbackError'}`} role="alert">
                      {errorKind !== 'validation' && (
                        <span className="loginFeedbackIcon" aria-hidden="true">×</span>
                      )}
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="loginForm">
                    <div className="loginField">
                      <label htmlFor="username">Username</label>
                      <input
                        type="text"
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        placeholder="Enter your username"
                        disabled={loading}
                      />
                    </div>

                    <div className="loginField passwordField">
                      <label htmlFor="password">Password</label>
                      <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="********"
                        disabled={loading}
                      />
                    </div>

                    <button type="submit" disabled={loading} className="loginButton">
                      {loading ? 'Logging in...' : 'Login'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
