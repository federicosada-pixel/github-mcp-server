import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PendingRule } from '../types'

const pending = atom({ plugin: 'reflect', key: 'pending' } as const, null)
const isEditing = atom({ plugin: 'reflect', key: 'isEditing' } as const, false)
const draft = atom({ plugin: 'reflect', key: 'draft' } as const, '')

const RULE_PROMPT = (text: string) =>
  `This is a correction someone just gave an AI coding assistant: "${text}"\n\n` +
  `Write it as one short imperative rule for a CLAUDE.md instructions file ` +
  `(e.g. "Always use pnpm instead of npm in this repository."). Answer with ` +
  `only the rule text, no quotes, no extra commentary.`

const classifyAndSuggest = async ($: EngineInterface, text: string) => {
  const label = await $.model
    .classify(text, ['correction', 'other'], { model: 'haiku' })
    .catch(() => undefined)

  if (label !== 'correction') {
    return
  }

  const reply = await $.model
    .complete({ model: 'haiku', prompt: RULE_PROMPT(text), effort: 'low' })
    .catch(() => undefined)

  if (reply === undefined || !reply.isAnswered) {
    return
  }

  const rule: PendingRule = { text: reply.text.trim(), original: text }
  await update($, pending, () => rule)
  await update($, isEditing, () => false)
}

const appendRule = async ($: EngineInterface, path: string, rule: string) => {
  const exists = await $.fs.exists(path)
  const header = '# CLAUDE.md\n\n## Rules\n\n'
  const before = exists ? await $.fs.read(path) : header
  const sep = before.endsWith('\n') || before === '' ? '' : '\n'
  await $.fs.write(path, `${before}${sep}- ${rule}\n`)
}

const dismiss = async ($: EngineInterface) => {
  await update($, pending, () => null)
  await update($, isEditing, () => false)
  await update($, draft, () => '')
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    void classifyAndSuggest($, e.text)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rule = await read($, pending)

    if (e.props.hasSurvey || rule === null) {
      return next(e)
    }

    // Every surface draws Box, Text and Button; only mobile lacks the Input the editor needs.
    const canEdit = e.surface !== 'mobile'
    const editing = await read($, isEditing)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (editing && e.surface !== 'mobile') {
      const { Input } = $.ui.resolve(e)
      const current = await read($, draft)

      return (
        <Box flexDirection="column">
          <Text dimColor>reflect &middot; edit the rule, then Enter</Text>
          <Input
            key="rule-input"
            value={current || rule.text}
            autoFocus
            onInput={value => update($, draft, () => value)}
            onSubmit={async value => {
              await appendRule($, './CLAUDE.md', value.trim() || rule.text)
              $.ui.toast('reflect: saved to ./CLAUDE.md')
              await dismiss($)
            }}
          />
        </Box>
      )
    }

    return (
      <Box>
        <Text dimColor>reflect &middot; &quot;{rule.text}&quot; </Text>
        <Button
          key="save"
          label="Save"
          hotkey="s"
          onPress={async () => {
            await appendRule($, './CLAUDE.md', rule.text)
            $.ui.toast('reflect: saved to ./CLAUDE.md')
            await dismiss($)
          }}
        />
        <Button
          key="global"
          label="Global instead"
          hotkey="g"
          onPress={async () => {
            const home = await $.env.get('HOME')

            if (home === undefined) {
              $.ui.toast('reflect: no HOME to save a global rule to')

              return
            }

            await appendRule($, `${home}/.claude/CLAUDE.md`, rule.text)
            $.ui.toast('reflect: saved to your global CLAUDE.md')
            await dismiss($)
          }}
        />
        {canEdit && (
          <Button
            key="edit"
            label="Edit"
            hotkey="e"
            onPress={async () => {
              await update($, draft, () => rule.text)
              await update($, isEditing, () => true)
            }}
          />
        )}
        <Button key="skip" label="Skip" hotkey="k" onPress={() => dismiss($)} />
      </Box>
    )
  })
}
