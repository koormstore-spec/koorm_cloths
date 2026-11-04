import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StarRating from './StarRating';

const countFilledStars = (container) =>
  Array.from(container.querySelectorAll('svg')).filter((svg) => svg.getAttribute('fill') === 'currentColor').length;

describe('StarRating', () => {
  it('always renders exactly 5 stars', () => {
    const { container } = render(<StarRating rating={3} />);
    expect(container.querySelectorAll('svg')).toHaveLength(5);
  });

  it('fills stars up to the rounded rating', () => {
    const { container } = render(<StarRating rating={3.6} />);
    // 3.6 rounds to 4
    expect(countFilledStars(container)).toBe(4);
  });

  it('rounds down when the fractional part is below .5', () => {
    const { container } = render(<StarRating rating={3.4} />);
    expect(countFilledStars(container)).toBe(3);
  });

  it('treats a missing/zero rating as no filled stars', () => {
    const { container } = render(<StarRating />);
    expect(countFilledStars(container)).toBe(0);
  });

  it('caps at 5 filled stars even if rating exceeds 5', () => {
    const { container } = render(<StarRating rating={7} />);
    expect(countFilledStars(container)).toBe(5);
  });

  it('shows the review count in parentheses when provided', () => {
    render(<StarRating rating={4} count={128} />);
    expect(screen.getByText('(128)')).toBeInTheDocument();
  });

  it('omits the count entirely when not provided', () => {
    render(<StarRating rating={4} />);
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it('shows the count even when it is zero', () => {
    render(<StarRating rating={0} count={0} />);
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });
});
