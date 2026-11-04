import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: { post: vi.fn() },
}));

function AuthProbe() {
  const { user, register, verifyEmail, requestLoginCode, verifyLoginCode, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'anonymous'}</span>
      <button onClick={() => register('Jane', 'jane@example.com', '999')}>register</button>
      <button onClick={() => verifyEmail('jane@example.com', '123456')}>verify-email</button>
      <button onClick={() => requestLoginCode('jane@example.com')}>request-login-code</button>
      <button onClick={() => verifyLoginCode('jane@example.com', '123456')}>verify-login-code</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

const renderWithProvider = () =>
  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>
  );

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('starts with no user when localStorage is empty', () => {
    renderWithProvider();
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous');
  });

  it('restores the user from localStorage on mount', () => {
    localStorage.setItem('koorm_user', JSON.stringify({ id: 1, email: 'saved@example.com', token: 'abc' }));
    renderWithProvider();
    expect(screen.getByTestId('user')).toHaveTextContent('saved@example.com');
  });

  it('register does not create a session by itself (just sends a code)', async () => {
    api.post.mockResolvedValueOnce({ data: { message: 'sent', email: 'jane@example.com' } });
    renderWithProvider();

    fireEvent.click(screen.getByText('register'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        name: 'Jane',
        email: 'jane@example.com',
        phone: '999',
      })
    );
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous');
    expect(localStorage.getItem('koorm_user')).toBeNull();
  });

  it('verifyEmail stores the returned user in state and localStorage', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 2, email: 'jane@example.com', token: 'tok-456' } });
    renderWithProvider();

    fireEvent.click(screen.getByText('verify-email'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('jane@example.com'));
    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', { email: 'jane@example.com', code: '123456' });
    expect(JSON.parse(localStorage.getItem('koorm_user')).token).toBe('tok-456');
  });

  it('requestLoginCode does not create a session by itself', async () => {
    api.post.mockResolvedValueOnce({ data: { message: 'sent' } });
    renderWithProvider();

    fireEvent.click(screen.getByText('request-login-code'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/request-login-code', { email: 'jane@example.com' })
    );
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous');
  });

  it('verifyLoginCode stores the returned user in state and localStorage', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 1, email: 'jane@example.com', token: 'tok-123' } });
    renderWithProvider();

    fireEvent.click(screen.getByText('verify-login-code'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('jane@example.com'));
    expect(api.post).toHaveBeenCalledWith('/auth/verify-login-code', {
      email: 'jane@example.com',
      code: '123456',
    });
    expect(JSON.parse(localStorage.getItem('koorm_user')).token).toBe('tok-123');
  });

  it('logout clears both state and localStorage', async () => {
    localStorage.setItem('koorm_user', JSON.stringify({ id: 1, email: 'saved@example.com', token: 'abc' }));
    renderWithProvider();
    expect(screen.getByTestId('user')).toHaveTextContent('saved@example.com');

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anonymous'));
    expect(localStorage.getItem('koorm_user')).toBeNull();
  });
});
