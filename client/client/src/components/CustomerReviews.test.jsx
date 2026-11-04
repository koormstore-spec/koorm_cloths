import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomerReviews from './CustomerReviews';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
const review = { id: 3, rating: 4, comment: 'A lovely comfortable shirt.', user_name: 'Test C.', product_name: 'Linen shirt', product_slug: 'linen-shirt', product_image: '/shirt.jpg' };
const show = () => render(<MemoryRouter><CustomerReviews /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  useAuth.mockReturnValue({ user: { id: 9 } });
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/reviews/store' ? { reviews: [], page: 1, pages: 0 } : { products: [{ id: 2, name: 'Linen shirt' }], pages: 1 } }));
});
const fill = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled());
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: review.comment } });
};

it('lets guests read persisted reviews while requiring sign-in to submit', async () => {
  useAuth.mockReturnValue({ user: null });
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/reviews/store' ? { reviews: [review], page: 1, pages: 1 } : { products: [], pages: 0 } }));
  show();
  expect(await screen.findByText(review.comment)).toBeInTheDocument();
  expect(screen.getByLabelText('Your review')).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Sign in to write a review' })).toHaveAttribute('href', '/login');
  expect(screen.queryByText('Sample review')).not.toBeInTheDocument();
});

it('saves a review and displays the server response immediately', async () => {
  api.post.mockResolvedValue({ data: { review } });
  show();
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  expect(await screen.findByText(review.comment)).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/reviews/store', { rating: 4, comment: review.comment });
  expect(screen.getByText('Thank you! Your review is now displayed above.')).toBeInTheDocument();
  expect(screen.getByLabelText('Your review')).toHaveValue('');
});

it('preserves text and reports failure so the customer can retry', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  show();
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your review');
  expect(screen.getByLabelText('Your review')).toHaveValue(review.comment);
  expect(screen.queryByText('Thank you! Your review is now displayed above.')).not.toBeInTheDocument();
});

it('adds a new card for each submission and keeps earlier comments from the same customer', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/reviews/store' ? { reviews: [review], page: 1, pages: 1 } : { products: [{ id: 2, name: 'Linen shirt' }], pages: 1 } }));
  api.post.mockResolvedValueOnce({ data: { review: { ...review, id: 4, comment: 'Another experience' } } })
    .mockResolvedValueOnce({ data: { review: { ...review, id: 5, comment: 'Third experience' } } });
  show();
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  expect(await screen.findByText('Another experience')).toBeInTheDocument();
  expect(screen.getByText(review.comment)).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(2);
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  expect(await screen.findByText('Third experience')).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getAllByRole('article')[0]).toHaveTextContent('Third experience');
});

it('loads more saved reviews and shows an error without losing existing cards', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/reviews/store' ? { reviews: [review], page: 1, pages: 2 } : { products: [], pages: 0 } }));
  show();
  const more = await screen.findByRole('button', { name: 'More reviews' });
  api.get.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(more);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load more reviews');
  expect(screen.getByText(review.comment)).toBeInTheDocument();
  api.get.mockResolvedValueOnce({ data: { reviews: [{ ...review, id: 4, comment: 'Second customer review' }], page: 2, pages: 2 } });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
});
