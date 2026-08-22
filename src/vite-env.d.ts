/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_API_BASE_URL?: string
  /** 文档未约定的数字人成片接口，可按服务端 GET /api/v1/meta 对照修改 */
  readonly VITE_V1_DIGITAL_HUMAN_SUBMIT?: string
  readonly VITE_V1_DIGITAL_HUMAN_STATUS?: string
  readonly VITE_RH_DH_WORKFLOW_ID?: string
  readonly VITE_RH_DH_VIDEO_NODE?: string
  readonly VITE_RH_DH_VIDEO_FIELD?: string
  readonly VITE_RH_DH_AUDIO_NODE?: string
  readonly VITE_RH_DH_AUDIO_FIELD?: string
  readonly VITE_RH_DH_TEXT_NODE?: string
  readonly VITE_RH_DH_TEXT_FIELD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
