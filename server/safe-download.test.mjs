import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { assertSafeRemoteUrl, downloadToFile, fetchTextLimited } from './safe-download.mjs'

test('downloadToFile streams a response to disk', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'x-doctor-download-'))
  const target = path.join(directory, 'video.mp4')
  t.after(() => rm(directory, { recursive: true, force: true }))

  await downloadToFile('https://cdn.example/video.mp4', target, {
    maxBytes: 32,
    fetchImpl: async () => new Response('video-data'),
  })

  assert.equal(await readFile(target, 'utf8'), 'video-data')
})

test('downloadToFile removes a partial file when a chunked response exceeds the limit', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'x-doctor-download-'))
  const target = path.join(directory, 'video.mp4')
  t.after(() => rm(directory, { recursive: true, force: true }))
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('12345'))
      controller.enqueue(new TextEncoder().encode('67890'))
      controller.close()
    },
  })

  await assert.rejects(
    () => downloadToFile('https://cdn.example/video.mp4', target, {
      maxBytes: 8,
      fetchImpl: async () => new Response(body),
    }),
    /超过.*限制/,
  )
  await assert.rejects(() => access(target))
})

test('fetchTextLimited rejects oversized text responses', async () => {
  await assert.rejects(
    () => fetchTextLimited('https://cdn.example/result.txt', {
      maxBytes: 4,
      fetchImpl: async () => new Response('12345'),
    }),
    /超过.*限制/,
  )
})

test('assertSafeRemoteUrl rejects local and private network targets', () => {
  for (const url of [
    'http://example.com/video.mp4',
    'https://localhost/video.mp4',
    'https://127.0.0.1/video.mp4',
    'https://10.1.2.3/video.mp4',
    'https://192.168.1.2/video.mp4',
    'https://[::1]/video.mp4',
  ]) {
    assert.throws(() => assertSafeRemoteUrl(url), /安全的 HTTPS/)
  }
  assert.equal(assertSafeRemoteUrl('https://cdn.example/video.mp4').hostname, 'cdn.example')
})

test('downloadToFile validates a redirect target before requesting it', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'x-doctor-download-'))
  const target = path.join(directory, 'video.mp4')
  t.after(() => rm(directory, { recursive: true, force: true }))
  const calls = []

  await assert.rejects(
    () => downloadToFile('https://cdn.example/video.mp4', target, {
      maxBytes: 32,
      fetchImpl: async (url) => {
        calls.push(String(url))
        return new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/private' },
        })
      },
    }),
    /安全的 HTTPS/,
  )
  assert.deepEqual(calls, ['https://cdn.example/video.mp4'])
})
