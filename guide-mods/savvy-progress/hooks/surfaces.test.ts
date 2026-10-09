import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// What a mod beneath this one draws in the band; it must still show.
const BELOW = { type: 'Box' as const, children: [{ type: 'Text' as const, children: ['below-row'] }] }

const mockEngine = (on: On) => {
  on('tool.call', ($, e) => {
    if (e.tool === 'Agent') {
      return {
        result: {
          status: 'async_launched' as const,
          agentId: 'sub1',
          description: e.description,
          resolvedModel: 'claude-sonnet-5-5',
          prompt: e.prompt,
          outputFile: '/tmp/out.txt',
        },
        text: '',
      }
    }

    return { result: {}, text: '' }
  })
  on('ui.render', () => BELOW)
}

const abovePromptProps = () => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const) {
  test(`the summary draws on ${surface} and stacks above the band beneath`, async ($, on) => {
    mockEngine(on)

    await $.tool.call({ tool: 'Agent', description: 'Add JSDoc', prompt: 'add jsdoc', model: 'sonnet' })

    const ui = await $.ui.mount({
      plugin: 'savvy-progress',
      surface,
      component: 'AbovePrompt',
      props: abovePromptProps(),
    })

    expect((await ui.find({ type: 'Text', text: /running/ }))?.text).toContain('1 running, 0 done')
    expect((await ui.find({ type: 'Text', text: 'below-row' }))?.text).toBe('below-row')
  })
}
