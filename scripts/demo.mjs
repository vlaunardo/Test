state.page = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage())
await state.page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await waitForPageLoad({ page: state.page, timeout: 10000 })
console.log('URL:', state.page.url())
await snapshot({ page: state.page }).then(console.log)

// Click the first starter question
await state.page.locator('button:has-text("Explain the neutral zone and why it matters")').click()

// Wait for streaming answer (local model is slow ~35s)
await state.page.waitForTimeout(40000)

// Snapshot the answer
await snapshot({ page: state.page }).then(console.log)