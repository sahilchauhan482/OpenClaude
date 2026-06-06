import { useEffect, useMemo, useRef, useState } from 'react';
import { vscode } from '../../vscode';
import type { PolicyPackStateMessage } from '../../../../src/webview/types';

type PolicyPackId =
  | 'safe-default'
  | 'codebase-strict'
  | 'auto-format-and-test'
  | 'enterprise-audit';

interface PolicyPackInfo {
  id: PolicyPackId;
  label: string;
  description: string;
}

interface PolicyPackManagerProps {
  onClose: () => void;
}

function isPolicyPackStateMessage(message: unknown): message is PolicyPackStateMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Record<string, unknown>;
  return candidate.type === 'policy_pack_state';
}

export function PolicyPackManager({ onClose }: PolicyPackManagerProps) {
  const [availablePacks, setAvailablePacks] = useState<PolicyPackInfo[]>([]);
  const [enabledPacks, setEnabledPacks] = useState<PolicyPackId[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = vscode.onMessage('policy_pack_state', (message) => {
      if (!isPolicyPackStateMessage(message)) {
        return;
      }

      setAvailablePacks(message.availablePacks);
      setEnabledPacks(message.enabledPacks);
    });

    vscode.postMessage({ type: 'get_policy_packs' });
    return () => {
      unsubscribe();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const enabled = useMemo(() => new Set(enabledPacks), [enabledPacks]);

  function togglePack(packId: PolicyPackId) {
    const next = enabled.has(packId)
      ? enabledPacks.filter((id) => id !== packId)
      : [...enabledPacks, packId];
    setEnabledPacks(next);
    vscode.postMessage({ type: 'set_policy_packs', packs: next });

    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Policy Packs</div>
            <div className="modal-subtitle">
              Built-in hook bundles for safer and more disciplined agent behavior.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {savedFlash ? (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-success-foreground, #3fb950)',
                transition: 'opacity 300ms ease',
              }}>
                Saved ✓
              </span>
            ) : null}
            <button className="modal-close" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="policy-pack-grid">
          {availablePacks.map((pack) => {
            const isEnabled = enabled.has(pack.id);
            return (
              <button
                key={pack.id}
                className={`policy-pack-card ${isEnabled ? 'policy-pack-card-enabled' : ''}`}
                onClick={() => togglePack(pack.id)}
              >
                <div className="policy-pack-header">
                  <span className="policy-pack-title">{pack.label}</span>
                  <span className={`policy-pack-toggle ${isEnabled ? 'policy-pack-toggle-enabled' : ''}`}>
                    {isEnabled ? 'Enabled' : 'Off'}
                  </span>
                </div>
                <div className="policy-pack-body">{pack.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
