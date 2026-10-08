import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

type Seen = { asked: string[]; ran: string[]; findCwd: (string | undefined)[] }

const mockEngine = (on: On, decision: 'Proceed' | 'Cancel') => {
  const seen: Seen = { asked: [], ran: [], findCwd: [] }

  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      const question = e.questions[0]?.question ?? ''
      seen.asked.push(question)

      return {
        result: { questions: e.questions, answers: { [question]: decision } },
        text: '',
      }
    }

    if (e.tool === 'Bash') {
      seen.ran.push(e.command)
    }

    return { result: {}, text: '' }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    const [cmd, ...rest] = e.argv
    const out = (stdout: string) => ({
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })

    if (cmd === 'find') {
      seen.findCwd.push(e.init?.cwd)
      const path = rest[0] ?? ''

      return out(`${path}\n${path}/a.txt\n${path}/b.txt\n`)
    }

    if (cmd === 'git' && rest[0] === 'clean') {
      return out('Would remove untracked.log\nWould remove dist/\n')
    }

    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return seen
}

test('a harmless command passes straight through, no question asked', async ($, on) => {
  const seen = mockEngine(on, 'Cancel')

  const result = await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(result.deny).toBeUndefined()
  expect(seen.asked).toHaveLength(0)
  expect(seen.ran).toEqual(['git status'])
})

test('rm -rf asks first, counting what would go, and Cancel denies it', async ($, on) => {
  const seen = mockEngine(on, 'Cancel')

  const result = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })

  expect(seen.asked[0]).toContain('would delete 3 path(s)')
  expect(result.deny).toContain('cancelled')
  expect(seen.ran).toHaveLength(0)
})

test('Proceed lets the command run', async ($, on) => {
  const seen = mockEngine(on, 'Proceed')

  const result = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })

  expect(result.deny).toBeUndefined()
  expect(seen.ran).toEqual(['rm -rf build'])
})

test('a leading cd is used as the folder to measure in', async ($, on) => {
  const seen = mockEngine(on, 'Cancel')

  await $.tool.call({ tool: 'Bash', command: 'cd /tmp/demo && rm -rf build' })

  expect(seen.findCwd).toEqual(['/tmp/demo'])
})

test('git clean -fd counts what the dry run would remove', async ($, on) => {
  const seen = mockEngine(on, 'Cancel')

  await $.tool.call({ tool: 'Bash', command: 'git clean -fd' })

  expect(seen.asked[0]).toContain('would delete 2 path(s)')
})

test('rm without both -r and -f is not held', async ($, on) => {
  const seen = mockEngine(on, 'Cancel')

  const result = await $.tool.call({ tool: 'Bash', command: 'rm -f single-file.txt' })

  expect(result.deny).toBeUndefined()
  expect(seen.asked).toHaveLength(0)
})
