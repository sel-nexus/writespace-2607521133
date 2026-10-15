/** Verify exact card presentation, role actions and fresh deletion checks through real storage. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BlogCard, { PostActions } from './BlogCard.jsx';

const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const post = {
  id: 'legacy/id', title: 'A good thought', content: `${'x'.repeat(120)}HIDDEN TAIL`,
  authorId: 'writer', authorName: 'Writer', createdAt: '2025-04-04T00:00:00.000Z',
};

/** Expose route changes without mocking React Router. */
function LocationProbe() {
  return (
    <p data-testid="location">
      {useLocation().pathname}
    </p>
  );
}

/** Mount a card inside one router and seed a current identity and complete post. */
function mount(props = {}, actionsOnly = false) {
  localStorage.setItem('writespace_posts', JSON.stringify([props.post || post]));
  if (props.session) localStorage.setItem('writespace_session', JSON.stringify(props.session));
  return render(
    <MemoryRouter initialEntries={['/blogs']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {actionsOnly ? <PostActions post={post} {...props} /> : <BlogCard post={post} {...props} />}
      <LocationProbe />
    </MemoryRouter>,
  );
}

 describe('BlogCard text and role presentation', () => {
  it('renders exactly 120 characters without ellipsis, a comma date, author avatar and encoded detail links', () => {
    mount();
    expect(screen.getByText('x'.repeat(120)).textContent).toBe('x'.repeat(120));
    expect(screen.queryByText(/HIDDEN TAIL/)).not.toBeInTheDocument();
    expect(screen.getByText('Apr 04, 2025')).toBeVisible();
    expect(screen.getByText('Writer')).toBeVisible();
    expect(screen.getByRole('img', { name: 'User avatar' })).toBeVisible();
    for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('href', '/blog/legacy%2Fid');
    expect(screen.getByRole('link', { name: /Read post/ })).toHaveAccessibleName(/^Read post.*A good thought$/);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('cycles the specified top border at index %i', (index) => {
    mount({ index });
    const expected = ['indigo', 'violet', 'pink', 'teal'][index % 4];
    expect(screen.getByRole('article')).toHaveClass(`border-t-${expected}-500`, 'border-t-4');
  });

  it('defaults index to indigo and safely renders invalid dates and literal markup', () => {
    const content = '<img src=x onerror=bad()>\n<script>bad()</script>';
    mount({ post: { ...post, title: '<b>Title</b>', content, createdAt: 'bad', authorId: 'admin' } });
    expect(screen.getByRole('article')).toHaveClass('border-t-indigo-500');
    expect(screen.getByText('Date unavailable')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(screen.getByRole('heading').textContent).toBe('<b>Title</b>');
    const body = screen.getByText(/<img src=x/);
    expect(body.textContent).toBe(content);
    expect(body).toHaveClass('whitespace-pre-wrap');
    expect(document.querySelector('img, script, b')).toBeNull();
  });

  it('uses a custom Admin author’s current session role without adding a role to the stored post', () => {
    const session = { ...writer, role: 'admin' };
    mount({ session });
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post]);
  });

  it.each([null, { ...writer, userId: 'not-owner' }])('hides edit/delete for guest or nonowner %j', (session) => {
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount({ session });
    write.mockClear();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([writer, admin])('shows own-user or any-Admin actions without writing during render: %j', (session) => {
    const confirm = vi.spyOn(window, 'confirm');
    mount({ session });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/edit/legacy%2Fid');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('follows the actual title and edit links on clicks', async () => {
    const user = userEvent.setup();
    const view = mount({ session: writer });
    await user.click(screen.getByRole('link', { name: 'Edit' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/edit/legacy%2Fid');
    view.unmount();
    mount();
    await user.click(screen.getByRole('link', { name: 'A good thought' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/blog/legacy%2Fid');
  });
});

 describe('PostActions mutation outcomes', () => {
  it('cancels silently without reading, writing, navigating or calling success/failure callbacks', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onFailure = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount({ session: writer, onDeleted, onFailure }, true);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/blogs');
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post]);
  });

  it.each([writer, admin])('deletes only on confirmation and calls onDeleted with the exact ID: %j', async (session) => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onFailure = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount({ session, onDeleted, onFailure });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([]);
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(post.id);
    expect(onFailure).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('defaults successful deletion to blogs navigation without a callback', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount({ session: writer }, true);
    await user.click(screen.getByRole('link', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([]);
  });

  it.each(['STORAGE_WRITE', 'STORAGE_READ', 'NOT_FOUND', 'FORBIDDEN'])('shows %s failure and never calls success or navigates', async (code) => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onFailure = vi.fn();
    mount({ session: writer, onDeleted, onFailure });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      if (code === 'STORAGE_WRITE') write.mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
      if (code === 'STORAGE_READ') localStorage.setItem('writespace_posts', '{broken');
      if (code === 'NOT_FOUND') localStorage.setItem('writespace_posts', '[]');
      if (code === 'FORBIDDEN') localStorage.setItem('writespace_posts', JSON.stringify([{ ...post, authorId: 'changed-owner' }]));
      write.mockClear();
      return true;
    });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({ ok: false, code });
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/blogs');
    if (code === 'STORAGE_WRITE') {
      expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post]);
      expect(write).toHaveBeenCalledTimes(1);
    } else expect(write).not.toHaveBeenCalled();
  });

  it('rejects a session removed during confirmation without deleting the visible post', async () => {
    const user = userEvent.setup();
    mount({ session: writer });
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      localStorage.removeItem('writespace_session');
      return true;
    });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('You no longer have permission');
    expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post]);
    expect(write).not.toHaveBeenCalled();
  });

  it('retains failed-delete feedback through cancellation, then clears it on an explicit successful retry', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    mount({ session: writer, onDeleted });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Denied'); });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    confirm.mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(write).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(post.id);
    expect(localStorage.getItem('writespace_posts')).toBe('[]');
  });
});
