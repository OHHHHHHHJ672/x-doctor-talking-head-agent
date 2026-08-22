import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createRunningHubConfigStore } from './runninghub-config.mjs'

test('configuration reads environment overrides and masks the key', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rh-config-'))
  const store = createRunningHubConfigStore({
    filePath: path.join(dir, 'settings.json'),
    env: { RUNNINGHUB_API_KEY: 'from-env', RUNNINGHUB_BASE_URL: 'https://rh.example' },
  })

  const config = await store.load()
  const publicConfig = store.toPublic(config)

  assert.equal(config.apiKey, 'from-env')
  assert.equal(config.baseUrl, 'https://rh.example')
  assert.equal(publicConfig.apiKeyConfigured, true)
  assert.equal('apiKey' in publicConfig, false)
})

test('saving merges a masked key without overwriting the stored secret', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rh-config-'))
  const filePath = path.join(dir, 'settings.json')
  const store = createRunningHubConfigStore({ filePath, env: {} })

  await store.save({ apiKey: 'stored-key', workflows: { rewrite: { workflowId: 'wf-a' } } })
  await store.save({ apiKey: '', workflows: { asr: { workflowId: 'wf-b' } } })
  const saved = JSON.parse(await readFile(filePath, 'utf8'))

  assert.equal(saved.apiKey, 'stored-key')
  assert.equal(saved.workflows.rewrite.workflowId, 'wf-a')
  assert.equal(saved.workflows.asr.workflowId, 'wf-b')
})

test('saving rejects unsupported base URL protocols', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rh-config-'))
  const store = createRunningHubConfigStore({ filePath: path.join(dir, 'settings.json'), env: {} })

  await assert.rejects(() => store.save({ baseUrl: 'file:///tmp/provider' }), /http/i)
})
