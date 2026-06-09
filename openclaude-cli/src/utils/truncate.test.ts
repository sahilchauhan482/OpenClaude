import { truncate, truncateToWidth, truncatePathMiddle } from './truncate.js'

// @ts-ignore
describe('truncate utilities', () => {
  // @ts-ignore
  test('truncate returns empty string for undefined input', () => {
    // @ts-ignore
    expect(truncate(undefined, 10)).toBe('')
  })

  // @ts-ignore
  test('truncateToWidth returns empty string for undefined input', () => {
    // @ts-ignore
    expect(truncateToWidth(undefined, 5)).toBe('')
  })

  // @ts-ignore
  test('truncatePathMiddle returns empty string for undefined path', () => {
    // @ts-ignore
    expect(truncatePathMiddle(undefined, 20)).toBe('')
  })
})
