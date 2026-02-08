import React, { useState, useRef, memo } from 'react';
import type { InputMode } from '../types';

interface Props {
  onSubmitDiff: (diffText: string) => void;
  onSubmitTwoPanes: (oldText: string, newText: string, fileName?: string) => void;
  onLoadDemo: () => void;
  onLoadRepoDiff?: () => void;
}

export const InputPanel: React.FC<Props> = memo(({ onSubmitDiff, onSubmitTwoPanes, onLoadDemo, onLoadRepoDiff }) => {
  const [mode, setMode] = useState<InputMode>('two-pane');
  const [diffText, setDiffText] = useState('');
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (mode === 'unified-diff') {
      if (diffText.trim()) onSubmitDiff(diffText);
    } else {
      if (oldText.trim() || newText.trim()) onSubmitTwoPanes(oldText, newText, fileName || undefined);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length >= 2) {
      // Two files dropped — compare them
      Promise.all([files[0].text(), files[1].text()]).then(([a, b]) => {
        setOldText(a);
        setNewText(b);
        setFileName(files[1].name);
        setMode('two-pane');
      });
    } else if (files.length === 1) {
      files[0].text().then(text => {
        // Detect if it's a diff
        if (text.includes('---') && text.includes('+++') || text.startsWith('diff --git')) {
          setDiffText(text);
          setMode('unified-diff');
        } else {
          setNewText(text);
          setFileName(files[0].name);
          setMode('two-pane');
        }
      });
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // If pasting into the main container (not a textarea), auto-detect
    if ((e.target as HTMLElement).tagName !== 'TEXTAREA') {
      const text = e.clipboardData.getData('text');
      if (text.includes('---') && text.includes('+++') || text.startsWith('diff --git')) {
        e.preventDefault();
        setDiffText(text);
        setMode('unified-diff');
        onSubmitDiff(text);
      }
    }
  };

  return (
    <div
      className={`input-panel ${dragActive ? 'drag-active' : ''}`}
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onPaste={handlePaste}
    >
      <div className="input-header">
        <h1 className="input-title">
          <span className="logo">&#xB1;</span> Diffy
        </h1>
        <p className="input-subtitle">AI Code Diff Viewer</p>
      </div>

      <div className="input-mode-tabs">
        <button
          className={`tab ${mode === 'two-pane' ? 'active' : ''}`}
          onClick={() => setMode('two-pane')}
        >
          Compare Two Texts
        </button>
        <button
          className={`tab ${mode === 'unified-diff' ? 'active' : ''}`}
          onClick={() => setMode('unified-diff')}
        >
          Paste Unified Diff
        </button>
      </div>

      {mode === 'unified-diff' ? (
        <div className="input-unified">
          <textarea
            className="input-textarea mono"
            placeholder={'Paste a unified diff here...\n\nExample:\n--- a/file.ts\n+++ b/file.ts\n@@ -1,5 +1,5 @@\n function hello() {\n-  console.log("hello");\n+  console.log("hello world");\n }'}
            value={diffText}
            onChange={e => setDiffText(e.target.value)}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="input-two-pane">
          <div className="input-pane">
            <div className="pane-label">Original</div>
            <textarea
              className="input-textarea mono"
              placeholder="Paste original code here..."
              value={oldText}
              onChange={e => setOldText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="input-pane">
            <div className="pane-label">Modified (AI-generated)</div>
            <textarea
              className="input-textarea mono"
              placeholder="Paste modified / AI-generated code here..."
              value={newText}
              onChange={e => setNewText(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      <div className="input-options">
        <input
          className="filename-input"
          type="text"
          placeholder="File name (optional, for syntax highlighting)"
          value={fileName}
          onChange={e => setFileName(e.target.value)}
        />
      </div>

      <div className="input-actions">
        <button className="btn btn-primary" onClick={handleSubmit}>
          View Diff
        </button>
        {onLoadRepoDiff ? (
          <button className="btn btn-secondary" onClick={onLoadRepoDiff}>
            Open Git Repo
          </button>
        ) : null}
        <button className="btn btn-secondary" onClick={onLoadDemo}>
          Try Demo
        </button>
        <span className="drop-hint">or drop files here</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length >= 2) {
            Promise.all([files[0].text(), files[1].text()]).then(([a, b]) => {
              setOldText(a);
              setNewText(b);
              setFileName(files[1].name);
              setMode('two-pane');
            });
          }
        }}
      />

      <div className="input-features">
        <div className="feature">
          <span className="feature-icon">&#x25A0;</span>
          <div>
            <strong>Side-by-side &amp; Unified</strong>
            <p>Toggle between IntelliJ-style side-by-side and compact unified views</p>
          </div>
        </div>
        <div className="feature">
          <span className="feature-icon">&#x2713;</span>
          <div>
            <strong>Accept / Reject Changes</strong>
            <p>Review AI-generated changes chunk by chunk with keyboard shortcuts</p>
          </div>
        </div>
        <div className="feature">
          <span className="feature-icon">&#x26A1;</span>
          <div>
            <strong>Blazing Fast</strong>
            <p>Virtual scrolling handles diffs with thousands of lines smoothly</p>
          </div>
        </div>
        <div className="feature">
          <span className="feature-icon">&#x1F50D;</span>
          <div>
            <strong>Word-level Diff</strong>
            <p>See exactly which words changed within each modified line</p>
          </div>
        </div>
      </div>
    </div>
  );
});

InputPanel.displayName = 'InputPanel';
