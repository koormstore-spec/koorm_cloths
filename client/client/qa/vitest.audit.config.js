import { mergeConfig } from 'vitest/config';
import base from '../vitest.config';

// Explicitly opt in: these audit checks confirm existing defects and are not
// part of the normal suite's assertions about intended behavior.
export default mergeConfig(base, {
  test: { include: ['qa/reproduce-checkout.jsx'] },
});
