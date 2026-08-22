import { Check, UploadCloud } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  convertAudioToMp3Local,
  fetchDigitalHumanStatus,
  prepareVideoForUploadLocal,
  resolveAssetUrl,
  submitDigitalHuman,
  uploadAudioWithProgress,
  uploadAvatarWithProgress,
} from '../../../lib/edgeApi'
import { useProjectStore } from '../../../store/useProjectStore'

const statusLabel = (status?: string) => {
  const s = String(status || '').toUpperCase()
  if (!s) return ''
  if (['RUNNING', 'PROCESSING', 'QUEUED', 'PENDING', 'WAITING'].includes(s)) return `${s}（处理中）`
  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'DONE', 'FINISHED'].includes(s)) return `${s}（已完成）`
  if (['FAILED', 'ERROR', 'CANCELED', 'TIMEOUT', 'FAIL'].includes(s)) return `${s}（失败）`
  return s
}

export function Step3Audio() {
  const {
    setSubmittedAudio,
    submittedAudio,
    avatars,
    selectedAvatarId,
    selectAvatar,
    addAvatar,
    deleteAvatar,
    addToast,
    completeStep,
    setPreviewVideoUrl,
    setPreviewComposed,
    quota,
    rewriteVariants,
    selectedRewriteId,
  } = useProjectStore()
  const [taskStatus, setTaskStatus] = useState('待提交')
  const [submitting, setSubmitting] = useState(false)
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null)
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null)
  const [audioUploadProgress, setAudioUploadProgress] = useState(0)
  const [videoUploadProgress, setVideoUploadProgress] = useState(0)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  const handleAudioUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPendingAudioFile(file)
    setSubmittedAudio({ name: file.name, duration: '待上传' })
    addToast({ type: 'success', message: '音频已选择，点击提交后开始上传' })
  }

  const onVideoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPendingVideoFile(file)
    addToast({ type: 'success', message: '视频已选择，点击提交后开始上传' })
  }

  return (
    <div className="step-pane material-pane">
      <div className="material-grid">
        <div className="material-col">
          <p className="material-title">🎵 参考音频</p>
          <label className={`material-upload ${submittedAudio ? 'uploaded' : ''}`}>
            <UploadCloud size={16} />
            上传音频文件
            <small>建议30秒以上</small>
            <input type="file" accept=".wav,.mp3,.m4a,audio/*" hidden onChange={handleAudioUpload} />
          </label>
          {submittedAudio && (
            <>
              <p className="material-ok">
                ✓ {submittedAudio.name} {submittedAudio.duration}
                <button
                  type="button"
                  className="text-link"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setPendingAudioFile(null)
                    setSubmittedAudio(null)
                  }}
                >
                  × 删除重选
                </button>
              </p>
              {submitting && audioUploadProgress > 0 && audioUploadProgress < 100 && (
                <div style={{ marginTop: 6 }}>
                  <div className="material-wave" style={{ height: 6, opacity: 0.2 }} />
                  <div
                    style={{
                      height: 6,
                      width: `${audioUploadProgress}%`,
                      marginTop: -6,
                      borderRadius: 999,
                      background: 'linear-gradient(90deg,#34d399,#22c55e)',
                    }}
                  />
                  <p className="hint" style={{ marginTop: 4 }}>音频上传进度：{audioUploadProgress}%</p>
                </div>
              )}
              <div className="material-wave" />
            </>
          )}
        </div>
        <div className="material-col with-divider">
          <p className="material-title">🎬 数字人视频</p>
          <label className={`material-upload ${avatars.length > 0 ? 'uploaded' : ''}`}>
            <UploadCloud size={16} />
            上传视频文件
            <small>建议正面出镜10秒以上</small>
            <input type="file" accept=".mp4,.mov,video/*" hidden onChange={onVideoUpload} />
          </label>
          {(pendingVideoFile || avatars.length > 0) && (
            <div className="material-video-list">
              {pendingVideoFile ? (
                <button type="button" className="material-thumb active">
                  <img src="/placeholder-avatar.svg" alt={pendingVideoFile.name} />
                  <span>{pendingVideoFile.name}</span>
                  <i
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingVideoFile(null)
                    }}
                  >
                    ×
                  </i>
                  <Check size={12} className="avatar-check" />
                </button>
              ) : (
                avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  className={`material-thumb ${selectedAvatarId === avatar.id ? 'active' : ''}`}
                  onClick={() => selectAvatar(avatar.id)}
                >
                  <img src={resolveAssetUrl(avatar.thumbnailPath)} alt={avatar.name} />
                  <span>{avatar.name}</span>
                  <i
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteAvatar(avatar.id)
                    }}
                  >
                    ×
                  </i>
                  {selectedAvatarId === avatar.id && <Check size={12} className="avatar-check" />}
                </button>
                ))
              )}
            </div>
          )}
          {submitting && videoUploadProgress > 0 && videoUploadProgress < 100 && (
            <div style={{ marginTop: 8 }}>
              <div className="material-wave" style={{ height: 6, opacity: 0.2 }} />
              <div
                style={{
                  height: 6,
                  width: `${videoUploadProgress}%`,
                  marginTop: -6,
                  borderRadius: 999,
                  background: 'linear-gradient(90deg,#60a5fa,#3b82f6)',
                }}
              />
              <p className="hint" style={{ marginTop: 4 }}>视频上传进度：{videoUploadProgress}%</p>
            </div>
          )}
        </div>
      </div>
      <button
        className="btn-primary full"
        disabled={!pendingAudioFile || !pendingVideoFile || submitting}
        onClick={async () => {
          try {
            setTaskStatus('正在校验提交条件...')
            if (quota && quota.remainingPoints < (quota.videoCostPerItem || 0)) {
              setTaskStatus('失败：剩余点数不足')
              addToast({ type: 'error', message: '剩余点数不足，无法提交数字人任务' })
              return
            }
            setSubmitting(true)
            setPreviewComposed(false)
            const audioFile = pendingAudioFile
            const videoFile = pendingVideoFile
            if (!audioFile || !videoFile) {
              throw new Error('请先选择音频和视频后再提交')
            }
            setTaskStatus('正在处理音频...')
            const convertedAudio = await convertAudioToMp3Local(audioFile)
            setTaskStatus('正在上传音频...')
            setAudioUploadProgress(0)
            const audioForm = new FormData()
            audioForm.append('file', convertedAudio)
            const audioData = await uploadAudioWithProgress(audioForm, setAudioUploadProgress)
            setSubmittedAudio({
              name: audioData.name || convertedAudio.name,
              duration: '已上传',
              audioPath: audioData.audioPath || audioData.fileRef,
            })

            setTaskStatus('正在处理视频...')
            const preparedVideo = await prepareVideoForUploadLocal(videoFile)
            setTaskStatus('正在上传视频...')
            setVideoUploadProgress(0)
            const videoForm = new FormData()
            videoForm.append('file', preparedVideo)
            const avatarData = await uploadAvatarWithProgress(videoForm, setVideoUploadProgress)
            addAvatar({
              ...avatarData,
              name: avatarData.name || preparedVideo.name || videoFile.name,
              videoPath: avatarData.videoPath || avatarData.fileRef || '',
              thumbnailPath: avatarData.thumbnailPath || '/placeholder-avatar.svg',
            })
            const activeRewrite = rewriteVariants.find((item) => item.id === selectedRewriteId)
            setTaskStatus('素材上传完成，正在提交数字人任务...')
            const submitData = await submitDigitalHuman({
              avatarVideoPath: avatarData.videoPath || avatarData.fileRef,
              audioName: audioData.name || convertedAudio.name,
              audioPath: audioData.audioPath || audioData.fileRef,
              rewriteText: activeRewrite?.fullText || '',
            })
            setTaskStatus('已提交，处理中...')
            setAudioUploadProgress(100)
            setVideoUploadProgress(100)
            setPendingAudioFile(null)
            setPendingVideoFile(null)
            if (pollRef.current) window.clearInterval(pollRef.current)
            pollRef.current = window.setInterval(async () => {
              try {
                const statusData = await fetchDigitalHumanStatus(submitData.taskId)
                const upstream = statusLabel((statusData as { upstreamStatus?: string }).upstreamStatus)
                setTaskStatus(`${upstream ? `${upstream} · ` : ''}处理中 ${statusData.progress}%`)
                if (statusData.status === 'done') {
                  if (pollRef.current) window.clearInterval(pollRef.current)
                  pollRef.current = null
                  setTaskStatus('处理完成，进入下一步')
                  const serverVideoPath = (statusData as { videoPath?: string }).videoPath
                  if (serverVideoPath) {
                    setPreviewVideoUrl(resolveAssetUrl(serverVideoPath))
                  } else {
                    const active = useProjectStore
                      .getState()
                      .avatars.find((a) => a.id === useProjectStore.getState().selectedAvatarId)
                    if (active?.videoPath) setPreviewVideoUrl(resolveAssetUrl(active.videoPath))
                  }
                  completeStep(2)
                  addToast({ type: 'success', message: '素材处理完成，已同步服务器结果' })
                  setSubmitting(false)
                }
              } catch (error) {
                if (pollRef.current) window.clearInterval(pollRef.current)
                pollRef.current = null
                setSubmitting(false)
                const message = error instanceof Error ? error.message : '任务状态获取失败'
                setTaskStatus(`失败：${String(message).slice(0, 80)}`)
                addToast({ type: 'error', message })
              }
            }, 5000)
          } catch (error) {
            setSubmitting(false)
            setAudioUploadProgress(0)
            setVideoUploadProgress(0)
            const message = error instanceof Error ? error.message : '提交失败，请检查本地服务'
            setTaskStatus(`失败：${String(message).slice(0, 80)}`)
            addToast({ type: 'error', message })
          }
        }}
      >
        {submitting ? '任务提交中...' : '提交至服务器生成视频'}
      </button>
      <p className="hint">预计 2-5 分钟 · 完成后自动进入下一步 · {taskStatus}</p>
    </div>
  )
}
