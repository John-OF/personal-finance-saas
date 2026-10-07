// Checks that every text/background pair of every theme meets WCAG AA (4.5:1 for text, 3:1 for
// borders of form controls and focus rings). Run: node apps/web/scripts/check-contrast.mjs
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/themes.css', import.meta.url), 'utf8')

/** { 'libreta/light': { background: '#…', … }, … } with dark modes inheriting their light tokens. */
const themes = {}
for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const theme = /data-theme='([a-z]+)'/.exec(selector)?.[1]
  if (!theme) continue
  const mode = selector.includes("data-mode='dark'") ? 'dark' : 'light'
  const tokens = Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(([, name, value]) => [name, value]),
  )
  themes[`${theme}/${mode}`] = { ...themes[`${theme}/light`], ...tokens }
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5
const NON_TEXT = 3
const checks = [
  ['foreground', 'background', TEXT],
  ['foreground', 'card', TEXT],
  ['foreground', 'muted', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'card', TEXT],
  ['primary-foreground', 'primary', TEXT],
  ['link', 'background', TEXT],
  ['link', 'card', TEXT],
  ['destructive', 'card', TEXT],
  ['destructive', 'background', TEXT],
  ['success', 'card', TEXT],
  ['input', 'card', NON_TEXT],
  ['ring', 'background', NON_TEXT],
  ['ring', 'card', NON_TEXT],
  ['accent-foreground', 'accent', TEXT],
]

let failures = 0
for (const [name, tokens] of Object.entries(themes)) {
  for (const [fg, bg, min] of checks) {
    const ratio = contrast(tokens[fg], tokens[bg])
    if (ratio < min) {
      failures++
      console.log(
        `✗ ${name}: ${fg} ${tokens[fg]} sobre ${bg} ${tokens[bg]} = ${ratio.toFixed(2)} (mín. ${min})`,
      )
    }
  }
}
console.log(
  failures === 0 ? `✓ ${Object.keys(themes).length} variantes cumplen AA` : `${failures} fallos`,
)
process.exitCode = failures === 0 ? 0 : 1
