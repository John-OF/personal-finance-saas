// Applies the stored theme before the first paint, so the page never flashes in the wrong colours.
// A separate file because the CSP forbids inline scripts. Mirrors src/lib/theme.ts.
;(function () {
  var themes = ['libreta', 'cobalto', 'malva', 'neutro', 'contraste']
  var modes = ['system', 'light', 'dark']
  var theme = 'libreta'
  var mode = 'system'
  try {
    var stored = JSON.parse(localStorage.getItem('libreta.theme') || 'null')
    if (stored && themes.indexOf(stored.theme) !== -1) theme = stored.theme
    if (stored && modes.indexOf(stored.mode) !== -1) mode = stored.mode
  } catch {
    // Blocked storage: keep the defaults.
  }
  if (mode === 'system') {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.mode = mode
})()
