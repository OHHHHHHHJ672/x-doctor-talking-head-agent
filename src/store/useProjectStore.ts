import { create } from 'zustand'

export type StepState = 'pending' | 'running' | 'done'
export type ToastType = 'success' | 'error' | 'loading'

export interface ProjectStep {
  id: number
  title: string
  description: string
  state: StepState
}

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ProjectItem {
  id: string
  name: string
  state: 'done' | 'running' | 'pending'
  platforms: string[]
}

interface StoreState {
  projects: ProjectItem[]
  activeProjectId: string
  steps: ProjectStep[]
  activeStep: number
  previewTab: 'preview' | 'copy'
  isApiModalOpen: boolean
  rewriteVariants: Array<{
    id: 'A' | 'B' | 'C'
    name: string
    similarity: string
    preview: string
    fullText: string
  }>
  selectedRewriteId: 'A' | 'B' | 'C'
  extractedCopy: string
  submittedAudio: { name: string; duration: string; audioPath?: string } | null
  avatars: Array<{
    id: string
    name: string
    thumbnailPath: string
    videoPath: string
    createdAt: string
  }>
  selectedAvatarId: string | null
  coverTitleVariants: Array<{ id: 'A' | 'B' | 'C'; text: string }>
  selectedCoverTitleId: 'A' | 'B' | 'C'
  coverTitle: string
  coverImage: string | null
  previewVideoUrl: string | null
  previewComposed: boolean
  subtitleText: string
  subtitleStyle: {
    fontSize: number
    fontColor: string
    strokeColor: string
    strokeWidth: number
    bold: boolean
  }
  coverStyle: {
    fontSize: number
    fontColor: string
    strokeColor: string
    strokeWidth: number
    bold: boolean
  }
  isServerConnected: boolean
  toasts: ToastItem[]
  addProject: () => void
  selectProject: (id: string) => void
  setActiveStep: (id: number) => void
  setPreviewTab: (tab: 'preview' | 'copy') => void
  toggleApiModal: (open?: boolean) => void
  setSelectedRewrite: (id: 'A' | 'B' | 'C') => void
  setRewriteVariants: (
    variants: Array<{
      id: 'A' | 'B' | 'C'
      name: string
      similarity: string
      preview: string
      fullText: string
    }>,
  ) => void
  updateRewriteText: (text: string) => void
  setExtractedCopy: (text: string) => void
  setSubmittedAudio: (audio: { name: string; duration: string; audioPath?: string } | null) => void
  addAvatar: (avatar: {
    id: string
    name: string
    thumbnailPath: string
    videoPath: string
    createdAt: string
  }) => void
  deleteAvatar: (id: string) => void
  selectAvatar: (id: string) => void
  selectCoverTitle: (id: 'A' | 'B' | 'C') => void
  updateCoverTitleText: (id: 'A' | 'B' | 'C', text: string) => void
  setCoverImage: (image: string | null) => void
  setSubtitleText: (text: string) => void
  updateSubtitleStyle: (partial: Partial<StoreState['subtitleStyle']>) => void
  updateCoverStyle: (partial: Partial<StoreState['coverStyle']>) => void
  setPreviewVideoUrl: (url: string | null) => void
  setPreviewComposed: (composed: boolean) => void
  completeStep: (id: number) => void
  setStepState: (id: number, state: StepState) => void
  setServerConnected: (connected: boolean) => void
  addToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: string) => void
}

const defaultSteps: ProjectStep[] = [
  { id: 1, title: '01 深度学习', description: '本地提取文案并完成智能改写', state: 'running' },
  { id: 2, title: '02 视频生成', description: '上传音频与形象素材，提交服务器生成视频', state: 'pending' },
  { id: 3, title: '03 添加字幕', description: '调整标题与字幕样式并生成预览', state: 'pending' },
]

export const useProjectStore = create<StoreState>((set) => ({
  projects: [
    { id: 'p1', name: '新建项目 1', state: 'running', platforms: [] },
  ],
  activeProjectId: 'p1',
  steps: defaultSteps,
  activeStep: 1,
  previewTab: 'preview',
  isApiModalOpen: false,
  rewriteVariants: [
    { id: 'A', name: 'AI 智能改写', similarity: '结构重构', preview: '', fullText: '' },
    { id: 'B', name: '备用', similarity: '-', preview: '', fullText: '' },
    { id: 'C', name: '备用', similarity: '-', preview: '', fullText: '' },
  ],
  selectedRewriteId: 'A',
  extractedCopy: '',
  submittedAudio: null,
  avatars: [],
  selectedAvatarId: null,
  coverTitleVariants: [
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
  ],
  selectedCoverTitleId: 'A',
  coverTitle: '',
  coverImage: null,
  previewVideoUrl: null,
  previewComposed: false,
  subtitleText: '',
  subtitleStyle: {
    fontSize: 32,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    bold: true,
  },
  coverStyle: {
    fontSize: 48,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    bold: true,
  },
  isServerConnected: false,
  toasts: [],
  addProject: () =>
    set((state) => {
      const id = `p${Date.now()}`
      const project = {
        id,
        name: `新项目 ${state.projects.length + 1}`,
        state: 'running' as const,
        platforms: ['抖'],
      }
      return {
        projects: [project, ...state.projects],
        activeProjectId: id,
      }
    }),
  selectProject: (id) => set({ activeProjectId: id }),
  setActiveStep: (id) => set({ activeStep: id }),
  setPreviewTab: (tab) => set({ previewTab: tab }),
  toggleApiModal: (open) =>
    set((state) => ({
      isApiModalOpen: typeof open === 'boolean' ? open : !state.isApiModalOpen,
    })),
  setSelectedRewrite: (id) => set({ selectedRewriteId: id }),
  setRewriteVariants: (variants) => set({ rewriteVariants: variants }),
  updateRewriteText: (text) =>
    set((state) => ({
      rewriteVariants: state.rewriteVariants.map((item) =>
        item.id === state.selectedRewriteId ? { ...item, fullText: text } : item,
      ),
    })),
  setExtractedCopy: (text) => set({ extractedCopy: text }),
  setSubmittedAudio: (audio) => set({ submittedAudio: audio }),
  addAvatar: (avatar) => set((state) => ({ avatars: [...state.avatars, avatar], selectedAvatarId: avatar.id })),
  deleteAvatar: (id) =>
    set((state) => ({
      avatars: state.avatars.filter((avatar) => avatar.id !== id),
      selectedAvatarId: state.selectedAvatarId === id ? null : state.selectedAvatarId,
    })),
  selectAvatar: (id) => set({ selectedAvatarId: id }),
  selectCoverTitle: (id) =>
    set((state) => ({
      selectedCoverTitleId: id,
      coverTitle: state.coverTitleVariants.find((item) => item.id === id)?.text ?? state.coverTitle,
    })),
  updateCoverTitleText: (id, text) =>
    set((state) => {
      const variants = state.coverTitleVariants.map((item) => (item.id === id ? { ...item, text } : item))
      const selectedText =
        variants.find((item) => item.id === state.selectedCoverTitleId)?.text ?? state.coverTitle
      return { coverTitleVariants: variants, coverTitle: selectedText }
    }),
  setCoverImage: (image) => set({ coverImage: image }),
  setSubtitleText: (text) => set({ subtitleText: text }),
  updateSubtitleStyle: (partial) =>
    set((state) => ({
      subtitleStyle: { ...state.subtitleStyle, ...partial },
    })),
  updateCoverStyle: (partial) =>
    set((state) => ({
      coverStyle: { ...state.coverStyle, ...partial },
    })),
  setPreviewVideoUrl: (url) => set({ previewVideoUrl: url }),
  setPreviewComposed: (composed) => set({ previewComposed: composed }),
  completeStep: (id) =>
    set((state) => ({
      steps: state.steps.map((step) => {
        if (step.id === id) return { ...step, state: 'done' }
        if (step.id === id + 1) return { ...step, state: 'running' }
        return step
      }),
      activeStep: Math.min(id + 1, state.steps.length),
    })),
  setStepState: (id, stepState) =>
    set((state) => ({
      steps: state.steps.map((step) => (step.id === id ? { ...step, state: stepState } : step)),
      activeStep: stepState === 'running' ? id : state.activeStep,
    })),
  setServerConnected: (connected) => set({ isServerConnected: connected }),
  addToast: (toast) =>
    set((state) => ({
      toasts: [{ id: crypto.randomUUID(), ...toast }, ...state.toasts].slice(0, 3),
    })),
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
