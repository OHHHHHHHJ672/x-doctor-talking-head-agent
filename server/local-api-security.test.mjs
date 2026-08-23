import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')

const startServer = (dataRoot, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/local-api.mjs'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        OPEN_BROWSER: '0',
        PORT: '0',
        X_DOCTOR_DATA_DIR: dataRoot,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`本机 API 启动超时\n${stdout}\n${stderr}`))
    }, 10_000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (!match) return
      clearTimeout(timer)
      resolve({ child, url: match[0] })
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (!stdout.match(/http:\/\/127\.0\.0\.1:\d+/)) {
        reject(new Error(`本机 API 提前退出(${code})\n${stdout}\n${stderr}`))
      }
    })
  })

test('only generated media directories are exposed under user-data', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'x-doctor-api-'))
  await mkdir(path.join(dataRoot, 'tmp'), { recursive: true })
  await mkdir(path.join(dataRoot, 'extracted'), { recursive: true })
  await writeFile(path.join(dataRoot, 'tmp', 'preview.mp4'), 'preview')
  await writeFile(path.join(dataRoot, 'extracted', 'source.mp4'), 'source')
  await writeFile(path.join(dataRoot, 'settings.json'), '{"apiKey":"secret"}')
  await writeFile(path.join(dataRoot, 'future-secret.txt'), 'private')

  const { child, url } = await startServer(dataRoot)
  t.after(async () => {
    child.kill()
    await rm(dataRoot, { recursive: true, force: true })
  })

  assert.equal((await fetch(`${url}/user-data/tmp/preview.mp4`)).status, 200)
  assert.equal((await fetch(`${url}/user-data/extracted/source.mp4`)).status, 200)
  assert.equal((await fetch(`${url}/user-data/settings.json`)).status, 404)
  assert.equal((await fetch(`${url}/user-data/future-secret.txt`)).status, 404)
})

test('media uploads reject files over the configured disk limit', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'x-doctor-api-'))
  const { child, url } = await startServer(dataRoot, { X_DOCTOR_UPLOAD_MAX_BYTES: '8' })
  t.after(async () => {
    child.kill()
    await rm(dataRoot, { recursive: true, force: true })
  })
  const body = new FormData()
  body.append('file', new Blob(['123456789']), 'oversized.mp4')

  const response = await fetch(`${url}/api/v1/RH/upload`, { method: 'POST', body })

  assert.equal(response.status, 413)
  assert.match(await response.text(), /文件.*过大/)
})
