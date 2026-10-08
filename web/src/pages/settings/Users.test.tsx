import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsUsers, { isValidEmail } from './Users';
import { server } from '@/test/msw-server';

vi.mock('@/store/me', () => ({
  useMe: () => ({
    me: {
      id: 1,
      email: 'admin@example.com',
      display_name: 'Admin',
      phone: '+8613800138000',
      role: 'admin',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

const mockUsers = [
  {
    id: 1,
    email: 'admin@example.com',
    display_name: 'Admin',
    phone: '+8613800138000',
    role: 'admin' as const,
    status: 'active' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    email: 'user@example.com',
    display_name: 'Regular User',
    phone: '+8613900139000',
    role: 'user' as const,
    status: 'active' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('SettingsUsers', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ongrid-locale', 'zh-CN');
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({
          items: mockUsers,
          total: mockUsers.length,
        }),
      ),
    );
  });

  it('regression: clearing an existing phone number sends empty string to PATCH /api/v1/users/:id', async () => {
    let patchPayload: { display_name?: string; phone?: string } | null = null;
    server.use(
      http.patch('/api/v1/users/2', async ({ request }) => {
        patchPayload = (await request.json()) as { display_name?: string; phone?: string };
        return HttpResponse.json({
          ...mockUsers[1],
          phone: patchPayload.phone ?? '',
        });
      }),
    );

    render(<SettingsUsers />);

    expect(await screen.findByText('Regular User')).toBeInTheDocument();

    const editButtons = screen.getAllByRole('button', { name: /编辑/i });
    // Click edit for regular user (second button)
    fireEvent.click(editButtons[1]);

    const phoneInput = screen.getByPlaceholderText(/选填，如 13800138000/i);
    expect(phoneInput).toHaveValue('+8613900139000');

    // Clear phone number
    fireEvent.change(phoneInput, { target: { value: '' } });
    expect(phoneInput).toHaveValue('');

    const saveButton = screen.getByRole('button', { name: /保存/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(patchPayload).not.toBeNull();
    });

    expect(patchPayload).toEqual({
      display_name: 'Regular User',
      phone: '',
    });
  });

  it('enforces 8-character minimum password in reset password modal', async () => {
    let resetPasswordPayload: { password?: string } | null = null;
    server.use(
      http.patch('/api/v1/users/2/password', async ({ request }) => {
        resetPasswordPayload = (await request.json()) as { password?: string };
        return HttpResponse.json({ ok: true });
      }),
    );

    render(<SettingsUsers />);

    expect(await screen.findByText('Regular User')).toBeInTheDocument();

    const moreButtons = screen.getAllByRole('button', { name: /更多操作/i });
    fireEvent.click(moreButtons[1]);

    const resetPwMenuItem = await screen.findByRole('menuitem', { name: /重置密码/i });
    fireEvent.click(resetPwMenuItem);

    const pwInput = screen.getByPlaceholderText(/至少 8 位/i);
    const submitBtn = screen.getByRole('button', { name: /重置/i });

    // Initially empty -> disabled
    expect(submitBtn).toBeDisabled();

    // Less than 8 characters -> disabled and shows hint
    fireEvent.change(pwInput, { target: { value: 'short' } });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/密码长度不足，至少需要 8 个字符/i)).toBeInTheDocument();

    // 8 characters or more -> enabled
    fireEvent.change(pwInput, { target: { value: 'password123' } });
    expect(submitBtn).not.toBeDisabled();
    expect(screen.queryByText(/密码长度不足，至少需要 8 个字符/i)).not.toBeInTheDocument();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(resetPasswordPayload).not.toBeNull();
    });
    expect(resetPasswordPayload).toEqual({ password: 'password123' });
  });

  describe('RFC 5322 email regex validation', () => {
    it('accepts valid email addresses including apostrophes', () => {
      expect(isValidEmail("o'connor@example.com")).toBe(true);
      expect(isValidEmail('user.name@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
      expect(isValidEmail('simple@example.com')).toBe(true);
    });

    it('rejects malformed email addresses with consecutive dots and bad syntax', () => {
      expect(isValidEmail('first..last@example.com')).toBe(false);
      expect(isValidEmail('user@example..com')).toBe(false);
      expect(isValidEmail('.user@example.com')).toBe(false);
      expect(isValidEmail('user.@example.com')).toBe(false);
      expect(isValidEmail('user@-example.com')).toBe(false);
      expect(isValidEmail('user@example-.com')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
      expect(isValidEmail('user@com')).toBe(false);
    });
  });
});
