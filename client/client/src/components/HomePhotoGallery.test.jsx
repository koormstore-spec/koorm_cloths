import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import HomePhotoGallery from './HomePhotoGallery';

describe('HomePhotoGallery', () => {
  it('uses live product names, links and every supplied photo', () => {
    const product = { id: 44, name: 'New linen shirt', slug: 'new-linen-shirt', colors: ['Olive'], images: ['/new/1.jpg', '/new/2.jpg'] };
    const { container, rerender } = render(<MemoryRouter><HomePhotoGallery products={[product]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument();
    expect(container.querySelectorAll('details a img')).toHaveLength(2);
    expect(container.querySelector('details a')).toHaveAttribute('href', '/product/new-linen-shirt');
    expect(container.querySelector('img[src^="/images/products/"]')).toBeNull();
    rerender(<MemoryRouter><HomePhotoGallery products={[]} /></MemoryRouter>);
    expect(container.querySelector('section')).toBeNull();
  });
});
