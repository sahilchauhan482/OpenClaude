import React from 'react';
import type { UiPermissionMode } from '../../utils/permissionMode';
import type { AvailableModel } from '../../hooks/useChat';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  permissionMode: UiPermissionMode;
  onModeChange: (mode: UiPermissionMode) => void;
  currentModel: string | null;
  availableModels: AvailableModel[];
  effortLevel: string;
  onEffortChange: (level: string) => void;
  fastModeEnabled: boolean;
  fastModeCanToggle: boolean;
  onFastModeToggle: () => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  permissionMode,
  onModeChange,
  currentModel,
  availableModels,
  effortLevel,
  onEffortChange,
  fastModeEnabled,
  fastModeCanToggle,
  onFastModeToggle,
}: SettingsPanelProps) {
  return (
    <div className={`settings-panel ${isOpen ? 'settings-panel-open' : ''}`}>
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">Settings</h3>
        <button className="settings-panel-close" onClick={onClose} aria-label="Close settings">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
          </svg>
        </button>
      </div>

      <div className="settings-panel-body">
        <div className="settings-section">
          <label className="settings-label">Permission Mode</label>
          <select
            className="settings-select"
            value={permissionMode}
            onChange={(e) => onModeChange(e.target.value as UiPermissionMode)}
          >
            <option value="default">Default</option>
            <option value="plan">Plan Mode</option>
            <option value="fullAccess">Full Access</option>
          </select>
        </div>

        <div className="settings-section">
          <label className="settings-label">Model</label>
          <select
            className="settings-select"
            value={currentModel ?? ''}
            disabled
          >
            {currentModel && <option value={currentModel}>{currentModel}</option>}
            {availableModels
              .filter((m) => m.id !== currentModel)
              .map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
          </select>
        </div>

        <div className="settings-section">
          <label className="settings-label">Effort Level</label>
          <select
            className="settings-select"
            value={effortLevel}
            onChange={(e) => onEffortChange(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="settings-section">
          <label className="settings-label">Fast Mode</label>
          <div className="settings-toggle-row">
            <span className="settings-toggle-label">
              {fastModeEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              className={`settings-toggle ${fastModeEnabled ? 'settings-toggle-on' : ''}`}
              onClick={onFastModeToggle}
              disabled={!fastModeCanToggle}
              role="switch"
              aria-checked={fastModeEnabled}
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
