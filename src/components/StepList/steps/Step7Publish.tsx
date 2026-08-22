export function Step7Publish() {
  return (
    <div className="step-pane">
      <div className="chip-grid">
        {['抖音', '小红书', '视频号', '快手'].map((platform) => (
          <label key={platform} className="chip">
            <input type="checkbox" defaultChecked={platform === '抖音'} />
            {platform}
          </label>
        ))}
      </div>
      <label className="toggle-row">
        <input type="checkbox" />
        定时发布
      </label>
      <input className="input" type="datetime-local" />
      <button className="btn-primary full">确认发布</button>
    </div>
  )
}
