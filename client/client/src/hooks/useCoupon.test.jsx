import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '../api/axios';
import useCoupon from './useCoupon';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const items = [{ id: 1, quantity: 1, price: 1000 }];
const show = (initialCode = '', userId = 1) => renderHook(({ bag, total }) => useCoupon(bag, total, initialCode, userId), { initialProps: { bag: items, total: 1000 } });

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: { eligible: true } });
  api.post.mockResolvedValue({ data: { code: 'FIRST30', discount_amount: 300 } });
});

it('prefills FIRST30 for an eligible customer and waits for Apply', async () => {
  const { result } = show();
  await waitFor(() => expect(result.current.couponCode).toBe('FIRST30'));
  expect(api.post).not.toHaveBeenCalled();
  expect(result.current.discountAmount).toBe(0);
  act(() => result.current.applyCoupon({ preventDefault() {} }));
  await waitFor(() => expect(result.current.discountAmount).toBe(300));
  expect(api.post).toHaveBeenCalledWith('/coupons/validate', { code: 'FIRST30' });
  expect(result.current.couponCode).toBe('FIRST30');
  expect(result.current.appliedCoupon?.code).toBe('FIRST30');
  act(() => result.current.removeCoupon());
  expect(result.current.couponCode).toBe('');
  expect(result.current.discountAmount).toBe(0);
});

it('clears a suggested code when the changed bag is no longer eligible', async () => {
  const { result, rerender } = show();
  await waitFor(() => expect(result.current.couponCode).toBe('FIRST30'));
  api.get.mockResolvedValue({ data: { eligible: false } });
  rerender({ bag: [{ id: 1, quantity: 2, price: 1000 }], total: 2000 });
  await waitFor(() => expect(result.current.couponCode).toBe(''));
  expect(api.post).not.toHaveBeenCalled();
  expect(result.current.couponError).toBe('');
});

it('waits for the bag to load before prefilling FIRST30', async () => {
  const { result, rerender } = renderHook(({ bag, total }) => useCoupon(bag, total, '', 1), {
    initialProps: { bag: [], total: 0 },
  });
  expect(api.get).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  rerender({ bag: items, total: 1000 });
  await waitFor(() => expect(result.current.couponCode).toBe('FIRST30'));
  expect(api.post).not.toHaveBeenCalled();
});

it('keeps FIRST30 carried into checkout applied when quantities change', async () => {
  const { result, rerender } = show('FIRST30');
  await waitFor(() => expect(result.current.discountAmount).toBe(300));
  api.post.mockResolvedValue({ data: { code: 'FIRST30', discount_amount: 600 } });
  rerender({ bag: [{ ...items[0], quantity: 2 }], total: 2000 });
  await waitFor(() => expect(result.current.discountAmount).toBe(600));
  expect(result.current.couponError).toBe('');
});

it('waits for the bag to load before validating a carried coupon', async () => {
  const { result, rerender } = renderHook(({ bag, total }) => useCoupon(bag, total, 'FIRST30', 1), {
    initialProps: { bag: [], total: 0 },
  });
  expect(api.post).not.toHaveBeenCalled();
  rerender({ bag: items, total: 1000 });
  await waitFor(() => expect(result.current.discountAmount).toBe(300));
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('does not validate the automatic coupon after removing the last item', async () => {
  const { result, rerender } = show('FIRST30');
  await waitFor(() => expect(result.current.discountAmount).toBe(300));
  rerender({ bag: [], total: 0 });
  expect(result.current.discountAmount).toBe(0);
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('revalidates an applied FIRST30 once when an emptied bag is refilled', async () => {
  const { result, rerender } = show('FIRST30');
  await waitFor(() => expect(result.current.discountAmount).toBe(300));
  rerender({ bag: [], total: 0 });
  rerender({ bag: items, total: 1000 });
  await waitFor(() => expect(result.current.discountAmount).toBe(300));
  expect(api.post).toHaveBeenCalledTimes(2);
});

it('does not bring FIRST30 back after the customer removes it, even if the bag changes', async () => {
  const { result, rerender } = show();
  await waitFor(() => expect(result.current.couponCode).toBe('FIRST30'));
  act(() => result.current.removeCoupon());
  rerender({ bag: [{ id: 1, quantity: 2, price: 1000 }], total: 2000 });
  await act(async () => {});
  expect(api.post).not.toHaveBeenCalled();
  expect(result.current.couponCode).toBe('');
  expect(result.current.discountAmount).toBe(0);
});

it('shows a validation error if the suggested coupon becomes unavailable before Apply', async () => {
  api.post.mockRejectedValue({ response: { data: { message: 'Coupon unavailable' } } });
  const { result } = show();
  await waitFor(() => expect(result.current.couponCode).toBe('FIRST30'));
  act(() => result.current.applyCoupon({ preventDefault() {} }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  await waitFor(() => expect(result.current.applyingCoupon).toBe(false));
  expect(result.current.couponCode).toBe('FIRST30');
  expect(result.current.couponError).toBe('Coupon unavailable');
  expect(result.current.discountAmount).toBe(0);
});

it('leaves the field empty for a returning customer', async () => {
  api.get.mockResolvedValue({ data: { eligible: false } });
  let view;
  await act(async () => { view = show(); });
  expect(api.get).toHaveBeenCalledWith('/coupons/first-order-eligibility', expect.any(Object));
  expect(view.result.current.couponCode).toBe('');
});

it('does not request eligibility for a guest', () => {
  const { result } = show('', null);
  expect(api.get).not.toHaveBeenCalled();
  expect(result.current.couponCode).toBe('');
});

it('clears the previous customer suggestion when the account changes', async () => {
  const { result, rerender } = renderHook(({ userId }) => useCoupon(items, 1000, '', userId), {
    initialProps: { userId: 1 },
  });
  await waitFor(() => expect(result.current.couponCode).toBe('FIRST30'));
  api.get.mockResolvedValue({ data: { eligible: false } });
  rerender({ userId: 2 });
  await act(async () => {});
  expect(result.current.couponCode).toBe('');
});

it('ignores eligibility for the previous bag', async () => {
  let resolveEligibility;
  api.get.mockReturnValueOnce(new Promise(resolve => { resolveEligibility = resolve; }));
  const { result, rerender } = show();
  api.get.mockResolvedValue({ data: { eligible: false } });
  rerender({ bag: [{ ...items[0], quantity: 2 }], total: 2000 });
  await act(async () => resolveEligibility({ data: { eligible: true } }));
  expect(result.current.couponCode).toBe('');
});

it.each(['SAVE20', ''])('preserves user input %j while eligibility is loading', async code => {
  let resolveEligibility;
  api.get.mockReturnValue(new Promise(resolve => { resolveEligibility = resolve; }));
  const { result } = show();
  act(() => {
    result.current.setCouponCode('SAVE20');
    result.current.setCouponCode(code);
  });
  await act(async () => resolveEligibility({ data: { eligible: true } }));
  expect(result.current.couponCode).toBe(code);
});

it('keeps and validates a coupon carried from the bag', async () => {
  api.post.mockResolvedValue({ data: { code: 'SAVE20', discount_amount: 200 } });
  const { result } = show('SAVE20');
  await waitFor(() => expect(result.current.appliedCoupon?.code).toBe('SAVE20'));
  expect(api.get).not.toHaveBeenCalled();
  expect(result.current.couponCode).toBe('SAVE20');
});

it('allows manual entry when eligibility cannot be loaded', async () => {
  api.get.mockRejectedValue(new Error('Network unavailable'));
  let view;
  await act(async () => { view = show(); });
  expect(view.result.current.couponCode).toBe('');
  expect(view.result.current.couponError).toBe('');
  act(() => view.result.current.setCouponCode('SAVE20'));
  expect(view.result.current.couponCode).toBe('SAVE20');
});

it('ignores an eligibility response after unmounting', async () => {
  let resolveEligibility;
  api.get.mockReturnValue(new Promise(resolve => { resolveEligibility = resolve; }));
  const { unmount } = show();
  const { signal } = api.get.mock.calls[0][1];
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolveEligibility({ data: { eligible: true } }));
  expect(api.post).not.toHaveBeenCalled();
});
