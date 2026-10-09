import { expect, mock, test } from 'claude-code/testing'

const RING = {
  command: 'ring',
  args: '',
  origin: { kind: 'sdk' } as const,
  presentation: { isFullscreen: false, columns: 80 },
}

test('only the newest 200 touches are kept', async ($, on) => {
  mock.clock(on)
  on('tool.call', () => ({ result: {}, text: '' }))

  for (let i = 0; i <= 200; i += 1) {
    await $.tool.call({ tool: 'Read', file_path: `/work/f${i}.ts` })
  }

  const { text } = await $.command.run(RING)
  const lines = text.split('\n')

  expect(lines).toHaveLength(200)
  expect(lines[0]).toBe('file  /work/f200.ts')
  expect(text).not.toContain('/work/f0.ts')
})
