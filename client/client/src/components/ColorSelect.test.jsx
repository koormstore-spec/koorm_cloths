import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ColorSelect from './ColorSelect';

const colors = ['Black', 'Royal Blue', 'White & Grey'];
function Example() {
  const [value, setValue] = useState('Black');
  return <><ColorSelect colors={colors} value={value} onChange={setValue} /><button>Outside</button></>;
}

it('supports keyboard navigation, type-ahead, confirmation, and clearing the colour', () => {
  render(<Example />);
  const control = screen.getByRole('combobox', { name: 'Colour' });
  control.focus();
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  fireEvent.keyDown(control, { key: 'End' });
  expect(control).toHaveTextContent('Black');
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(control).toHaveTextContent('White & Grey');
  expect(control).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.keyDown(control, { key: 'r' });
  expect(document.getElementById(control.getAttribute('aria-activedescendant'))).toHaveTextContent('Royal Blue');
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(control).toHaveTextContent('Royal Blue');
  fireEvent.keyDown(control, { key: 'Home' });
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(control).toHaveTextContent('All colours');
});

it('preserves selection when Escape is pressed or the user clicks outside', () => {
  render(<Example />);
  const control = screen.getByRole('combobox', { name: 'Colour' });
  fireEvent.click(control);
  fireEvent.keyDown(control, { key: 'End' });
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(control).toHaveTextContent('Black');
  expect(control).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(control);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(control).toHaveTextContent('Black');
});

it('shows the selected swatch and supports mouse selection of a mixed colour', () => {
  render(<Example />);
  const control = screen.getByRole('combobox', { name: 'Colour' });
  fireEvent.click(control);
  const option = screen.getByRole('option', { name: 'White & Grey' });
  const swatch = option.querySelector('.filter-color-swatch');
  expect(swatch.style.background).toContain('linear-gradient');
  fireEvent.click(option);
  expect(control).toHaveTextContent('White & Grey');
  expect(control.querySelector('.filter-color-swatch').style.background).toBe(swatch.style.background);
});
