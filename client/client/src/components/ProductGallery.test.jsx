import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductGallery from './ProductGallery';

const images = ['/front.jpg', '/back.jpg', '/detail.jpg'];

describe('ProductGallery', () => {
  it('changes images with next, previous, and thumbnail controls', () => {
    render(<ProductGallery images={images} name="Linen shirt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous product image' }));
    expect(screen.getByAltText('Linen shirt, view 3')).toHaveAttribute('src', '/detail.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Next product image' }));
    expect(screen.getByAltText('Linen shirt, view 1')).toHaveAttribute('src', '/front.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'View product image 2' }));
    expect(screen.getByAltText('Linen shirt, view 2')).toHaveAttribute('src', '/back.jpg');
    expect(screen.getByRole('button', { name: 'View product image 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('supports arrow keys and resets zoom when changing images', () => {
    render(<ProductGallery images={images} name="Linen shirt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in: Linen shirt, view 1' }));
    const zoomed = screen.getByRole('button', { name: 'Zoom out: Linen shirt, view 1' });
    fireEvent.keyDown(zoomed, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Zoom in: Linen shirt, view 2' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('handles products without images and hides arrows for a single image', () => {
    const { rerender } = render(<ProductGallery images={[]} name="Linen shirt" />);
    expect(screen.getByText('Image coming soon')).toBeInTheDocument();
    rerender(<ProductGallery images={images.slice(0, 1)} name="Linen shirt" />);
    expect(screen.queryByRole('button', { name: 'Next product image' })).not.toBeInTheDocument();
  });
});
