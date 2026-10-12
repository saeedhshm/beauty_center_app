import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('redirects an anonymous visitor to the Arabic admin login', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'مرحبًا بعودتك' })).toBeInTheDocument();
    expect(screen.getByLabelText('رقم الهاتف')).toHaveAttribute('autocomplete', 'username');
  });
});
