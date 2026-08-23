import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { RunningHubClient, RunningHubError, normalizeOutputs, taskStateFromPayload } from './runninghub-client.mjs'

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
})

test('createTask sends the RunningHub OpenAPI request shape', async () => {
  let call
  const client = new RunningHubClient({
    apiKey: 'rh-secret',
    baseUrl: 'https://www.runninghub.ai/',
    fetchImpl: async (url, init) => {
      call = { url, init }
      return jsonResponse({ code: 0, data: { taskId: 'task-123' } })
    },
  })

  const taskId = await client.createTask({
    workflowId: 'workflow-1',
    nodeInfoList: [{ nodeId: '7', fieldName: 'audio', fieldValue: 'openapi/a.mp3' }],
    instanceType: 'plus',
  })

  assert.equal(taskId, 'task-123')
  assert.equal(call.url, 'https://www.runninghub.ai/task/openapi/create')
  assert.deepEqual(JSON.parse(call.init.body), {
    apiKey: 'rh-secret',
    workflowId: 'workflow-1',
    nodeInfoList: [{ nodeId: '7', fieldName: 'audio', fieldValue: 'openapi/a.mp3' }],
    instanceType: 'plus',
  })
})

test('upload uses bearer authentication and returns a file reference', async () => {
  let call
  const client = new RunningHubClient({
    apiKey: 'rh-secret',
    fetchImpl: async (url, init) => {
      call = { url, init }
      return jsonResponse({ code: 0, data: { fileName: 'openapi/input.mp3' } })
    },
  })

  const fileRef = await client.uploadBuffer(Buffer.from('audio'), 'input.mp3', 'audio/mpeg')

  assert.equal(fileRef, 'openapi/input.mp3')
  assert.equal(call.init.headers.Authorization, 'Bearer rh-secret')
  assert.ok(call.init.body instanceof FormData)
})

test('uploadFile streams a file-backed blob without loading it into a Buffer first', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rh-upload-'))
  const filePath = path.join(directory, 'input.mp3')
  await writeFile(filePath, 'audio-from-disk')
  t.after(() => rm(directory, { recursive: true, force: true }))

  let uploadedFile
  const client = new RunningHubClient({
    apiKey: 'rh-secret',
    fetchImpl: async (_url, init) => {
      uploadedFile = init.body.get('file')
      return jsonResponse({ code: 0, data: { fileName: 'openapi/input.mp3' } })
    },
  })

  const fileRef = await client.uploadFile(filePath, 'audio/mpeg')

  assert.equal(fileRef, 'openapi/input.mp3')
  assert.equal(uploadedFile.name, 'input.mp3')
  assert.equal(uploadedFile.type, 'audio/mpeg')
  assert.equal(await uploadedFile.text(), 'audio-from-disk')
})

test('normalizeOutputs accepts common RunningHub output shapes', () => {
  assert.deepEqual(
    normalizeOutputs({ data: [{ fileUrl: 'https://cdn.example/out.mp4', fileType: 'video' }] }),
    [{ url: 'https://cdn.example/out.mp4', type: 'video', text: '' }],
  )
  assert.deepEqual(
    normalizeOutputs({ data: { outputs: [{ url: 'https://cdn.example/result.txt', text: '文案结果' }] } }),
    [{ url: 'https://cdn.example/result.txt', type: '', text: '文案结果' }],
  )
})

test('provider errors never include the API key', async () => {
  const client = new RunningHubClient({
    apiKey: 'do-not-leak',
    fetchImpl: async () => jsonResponse({ code: 500, msg: 'bad do-not-leak request' }, 500),
  })

  await assert.rejects(
    () => client.getOutputs('task-1'),
    (error) => error instanceof RunningHubError && !error.message.includes('do-not-leak'),
  )
})

test('getOutputs treats RunningHub processing codes as a task state', async () => {
  const client = new RunningHubClient({
    apiKey: 'rh-secret',
    fetchImpl: async () => jsonResponse({ code: 804, msg: 'task is running' }),
  })

  const payload = await client.getOutputs('task-1')

  assert.equal(taskStateFromPayload(payload), 'processing')
})

test('taskStateFromPayload recognizes completed and failed tasks', () => {
  assert.equal(taskStateFromPayload({ code: 0, data: [{ fileUrl: 'https://cdn.example/a.mp4' }] }), 'done')
  assert.equal(taskStateFromPayload({ code: 805, msg: 'task failed' }), 'failed')
})
